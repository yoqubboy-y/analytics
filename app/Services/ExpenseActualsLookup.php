<?php

namespace App\Services;

use App\Enums\ExpenseActualSource;
use App\Models\EquipmentPayment;
use App\Models\ExpenseActual;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;

/**
 * Read-time engine for `basis=actual` reports: preloads the real per-unit
 * expense data for a window once (two queries) and answers per-(unit, week)
 * amount lookups with no N+1. Truck/trailer payments come from the static
 * `equipment_payments` pool (monthly → weekly); fuel/toll/fleet come from the
 * `expense_actuals` ledger, summed per (source, unit, week).
 */
class ExpenseActualsLookup
{
    // Weekly slice of a monthly payment. Four weekly settlements per month, so a
    // 4-week window sums back to exactly the monthly amount (business rule).
    private const WEEKS_PER_MONTH = 4;

    /**
     * @param  array<string, array<string, list<array{from: CarbonImmutable, to: ?CarbonImmutable, monthly: float}>>>  $payments  [kind][unit] => rows
     * @param  array<string, array<string, array<string, float>>>  $ledger  [source][unit][weekStart Y-m-d] => summed amount
     */
    private function __construct(
        private array $payments,
        private array $ledger,
    ) {}

    /**
     * Build the lookup for the report window. Ledger rows are limited to the
     * window's ISO weeks; the payment pool is small and effective-dated, so it
     * is loaded whole and resolved by date.
     */
    public static function forWindow(CarbonInterface $start, CarbonInterface $end): self
    {
        $windowStart = CarbonImmutable::parse($start->toDateString())->startOfWeek();
        $windowEnd = CarbonImmutable::parse($end->toDateString());

        $payments = [];
        foreach (EquipmentPayment::query()->get() as $row) {
            $payments[$row->kind][self::normalize($row->unit)][] = [
                'from' => CarbonImmutable::parse($row->effective_from->toDateString()),
                'to' => $row->effective_to ? CarbonImmutable::parse($row->effective_to->toDateString()) : null,
                'monthly' => (float) $row->monthly_amount,
            ];
        }

        $ledger = [];
        // whereDate (not whereBetween) so the match is date-only, robust to a
        // stored time component regardless of how rows were loaded.
        $rows = ExpenseActual::query()
            ->whereDate('week_start', '>=', $windowStart->toDateString())
            ->whereDate('week_start', '<=', $windowEnd->toDateString())
            ->selectRaw('source, unit, week_start, SUM(amount) AS total')
            ->groupBy('source', 'unit', 'week_start')
            ->get();

        foreach ($rows as $row) {
            $week = CarbonImmutable::parse((string) $row->week_start)->toDateString();
            $ledger[$row->source][self::normalize($row->unit)][$week] = (float) $row->total;
        }

        return new self($payments, $ledger);
    }

    /**
     * The actual dollar amount for this expense source on the driver's resolved
     * truck/trailer for the given week — or null when there is no data (the
     * caller treats null as $0 real: no cost recorded that week).
     */
    public function amountFor(ExpenseActualSource $source, ?string $truckUnit, ?string $trailerUnit, CarbonImmutable $week): ?float
    {
        return match ($source) {
            ExpenseActualSource::TruckPayment => $this->payment('truck', $truckUnit, $week),
            ExpenseActualSource::TrailerPayment => $this->payment('trailer', $trailerUnit, $week),
            ExpenseActualSource::Fuel => $this->ledger('fuel', $truckUnit, $week),
            ExpenseActualSource::Toll => $this->ledger('toll', $truckUnit, $week),
            // Maintenance spans both sheets — a driver's truck AND trailer repairs.
            ExpenseActualSource::Fleet => $this->sum(
                $this->ledger('fleet', $truckUnit, $week),
                $this->ledger('fleet', $trailerUnit, $week),
            ),
        };
    }

    /**
     * Weekly slice of a unit's monthly payment in force on the week.
     */
    private function payment(string $kind, ?string $unit, CarbonImmutable $week): ?float
    {
        if ($unit === null) {
            return null;
        }

        $rows = $this->payments[$kind][self::normalize($unit)] ?? null;

        if ($rows === null) {
            return null;
        }

        $monthly = $this->resolveEffective($rows, $week);

        return $monthly === null ? null : round($monthly / self::WEEKS_PER_MONTH, 2);
    }

    private function ledger(string $source, ?string $unit, CarbonImmutable $week): ?float
    {
        if ($unit === null) {
            return null;
        }

        return $this->ledger[$source][self::normalize($unit)][$week->toDateString()] ?? null;
    }

    /**
     * Effective-date resolution identical to DriverConfig::assignmentAsOf: the
     * covering row with the latest effective_from wins; a date before the first
     * row falls back to the earliest; past a bounded end with no successor → null.
     *
     * @param  list<array{from: CarbonImmutable, to: ?CarbonImmutable, monthly: float}>  $rows
     */
    private function resolveEffective(array $rows, CarbonImmutable $week): ?float
    {
        usort($rows, fn ($a, $b) => $a['from'] <=> $b['from']);

        $covering = null;
        foreach ($rows as $row) {
            if ($row['from']->lessThanOrEqualTo($week)
                && ($row['to'] === null || $row['to']->greaterThanOrEqualTo($week))) {
                $covering = $row; // later effective_from overwrites — rows are sorted asc
            }
        }

        if ($covering !== null) {
            return $covering['monthly'];
        }

        $earliest = $rows[0] ?? null;

        return $earliest && $week->lessThan($earliest['from']) ? $earliest['monthly'] : null;
    }

    /**
     * Sum two optional amounts, preserving "no data at all" as null.
     */
    private function sum(?float $a, ?float $b): ?float
    {
        if ($a === null && $b === null) {
            return null;
        }

        return round(($a ?? 0.0) + ($b ?? 0.0), 2);
    }

    private static function normalize(?string $unit): string
    {
        return mb_strtoupper(trim((string) $unit));
    }

    /**
     * The window of ISO weeks that have any ledger coverage, for gating the
     * "actual" toggle. Returns [minWeekStart, maxWeekStart] as date strings, or
     * null when no actuals are loaded.
     *
     * @return array{0: string, 1: string}|null
     */
    public static function coveredWeeks(): ?array
    {
        /** @var Collection<int, ExpenseActual> $bounds */
        $bounds = ExpenseActual::query()
            ->selectRaw('MIN(week_start) AS min_week, MAX(week_start) AS max_week')
            ->get();

        $row = $bounds->first();

        if (! $row || $row->min_week === null) {
            return null;
        }

        return [
            (string) CarbonImmutable::parse((string) $row->min_week)->toDateString(),
            (string) CarbonImmutable::parse((string) $row->max_week)->toDateString(),
        ];
    }
}
