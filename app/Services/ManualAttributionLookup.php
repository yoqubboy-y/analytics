<?php

namespace App\Services;

use App\Models\ExpenseAttribution;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;

/**
 * Preloads manual expense attributions for a report window and indexes them by
 * (expense, driver config, ISO week) so `computeFinancials` can resolve a
 * manual expense's real dollars for a driver's week without per-row queries.
 *
 * Each bucket splits by who pays: `company` sums land as carrier cost;
 * `driver` sums are pass-throughs the driver covers (rendered negative,
 * excluded from Total Exp.) — mirroring `TeamExpense::isDriverPaidFor`.
 */
class ManualAttributionLookup
{
    /**
     * @param  array<int, array<int, array<string, array{company: float, driver: float}>>>  $index
     *                                                                                              [expenseId][configId][weekStart] => ['company' => float, 'driver' => float]
     */
    private function __construct(private array $index) {}

    /**
     * Build the lookup for a set of expenses across an inclusive week window.
     *
     * @param  array<int, int>  $expenseIds
     */
    public static function forWindow(array $expenseIds, CarbonInterface $start, CarbonInterface $end): self
    {
        if ($expenseIds === []) {
            return new self([]);
        }

        $windowStart = CarbonImmutable::parse($start->toDateString())->startOfWeek();
        $windowEnd = CarbonImmutable::parse($end->toDateString())->startOfWeek();

        $rows = ExpenseAttribution::query()
            ->whereIn('team_expense_id', $expenseIds)
            ->whereDate('week_start', '>=', $windowStart->toDateString())
            ->whereDate('week_start', '<=', $windowEnd->toDateString())
            ->selectRaw('team_expense_id, driver_config_id, week_start, paid_by, SUM(amount) AS total')
            ->groupBy('team_expense_id', 'driver_config_id', 'week_start', 'paid_by')
            ->get();

        $index = [];

        foreach ($rows as $row) {
            $expenseId = (int) $row->team_expense_id;
            $configId = (int) $row->driver_config_id;
            $week = CarbonImmutable::parse((string) $row->week_start)->toDateString();

            if (! isset($index[$expenseId][$configId][$week])) {
                $index[$expenseId][$configId][$week] = ['company' => 0.0, 'driver' => 0.0];
            }

            $bucket = $row->paid_by === 'driver' ? 'driver' : 'company';
            $index[$expenseId][$configId][$week][$bucket] += (float) $row->total;
        }

        return new self($index);
    }

    /**
     * The company/driver-paid split for one expense, driver config and week —
     * null when nothing was attributed (so the caller can skip the week).
     *
     * @return array{company: float, driver: float}|null
     */
    public function amountFor(int $expenseId, int $configId, CarbonImmutable $week): ?array
    {
        return $this->index[$expenseId][$configId][$week->toDateString()] ?? null;
    }
}
