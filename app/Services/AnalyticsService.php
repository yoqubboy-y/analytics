<?php

namespace App\Services;

use App\Models\DriverConfig;
use App\Models\Team;
use App\Models\TeamExpense;
use Carbon\Carbon;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class AnalyticsService
{
    /**
     * Get weekly P&L report rows for a team.
     *
     * Fetches raw financial data from the analytics DB, merges with local
     * driver configs, and computes P&L using the team's expense list.
     *
     * @return Collection<int, array<string, mixed>>
     */
    public function weeklyReport(Team $team, Carbon|CarbonImmutable $startDate, Carbon|CarbonImmutable $endDate): Collection
    {
        /** @var Collection<int, TeamExpense> $expenses */
        $expenses = $team->expenses;

        /** @var Collection<int, DriverConfig> $driverConfigs */
        $driverConfigs = $team->driverConfigs->keyBy('external_driver_id');

        $rows = $this->fetchRawData($team, $startDate, $endDate);

        $driverRows = $rows->map(fn (object $row) => $this->computeRow($row, $driverConfigs, $expenses));

        $totals = $this->computeTotals($driverRows, $expenses);

        return $driverRows->push($totals);
    }

    /**
     * Fetch raw aggregated data from the analytics database.
     *
     * @return Collection<int, object>
     */
    private function fetchRawData(Team $team, Carbon|CarbonImmutable $startDate, Carbon|CarbonImmutable $endDate): Collection
    {
        $sql = <<<'SQL'
            WITH week_boards AS (
                SELECT
                    gb.primary_driver_id,
                    gb.secondary_driver_id,
                    gb.dispatcher_id,
                    gb.rate,
                    gb.miles,
                    gb.start_date,
                    gb.end_date
                FROM gross_boards gb
                WHERE gb.is_deleted = FALSE
                  AND gb.object_type IN ('LOAD', 'DRAFT')
                  AND gb.company_id = :company_id
                  AND (
                      (
                          gb.start_date >= :start_date
                          AND gb.start_date <= :end_date
                          AND (gb.end_date IS NULL OR gb.end_date <= :end_date_plus_one)
                      )
                      OR (
                          gb.start_date >= :start_date_minus_seven
                          AND gb.start_date < :start_date
                          AND gb.end_date > :start_date
                      )
                  )
            ),
            event_boards AS (
                SELECT
                    gb.primary_driver_id,
                    gb.dispatcher_id,
                    gb.start_date,
                    gb.end_date
                FROM gross_boards gb
                WHERE gb.is_deleted = FALSE
                  AND gb.object_type = 'EVENT'
                  AND gb.company_id = :company_id
                  AND (
                      (
                          gb.start_date >= :start_date
                          AND gb.start_date <= :end_date
                          AND (gb.end_date IS NULL OR gb.end_date <= :end_date_plus_one)
                      )
                      OR (
                          gb.start_date >= :start_date_minus_seven
                          AND gb.start_date < :start_date
                          AND gb.end_date > :start_date
                      )
                  )
            ),
            driver_days AS (
                SELECT
                    wb.primary_driver_id AS driver_id,
                    COUNT(DISTINCT day::date) AS days_worked
                FROM week_boards wb
                CROSS JOIN LATERAL generate_series(
                    GREATEST(wb.start_date, :start_date),
                    LEAST(COALESCE(wb.end_date, :end_date), :end_date),
                    '1 day'::interval
                ) AS day
                GROUP BY wb.primary_driver_id
            ),
            driver_totals AS (
                SELECT
                    wb.primary_driver_id AS driver_id,
                    (
                        SELECT wb2.dispatcher_id
                        FROM week_boards wb2
                        WHERE wb2.primary_driver_id = wb.primary_driver_id
                          AND wb2.dispatcher_id IS NOT NULL
                        GROUP BY wb2.dispatcher_id
                        ORDER BY COUNT(*) DESC
                        LIMIT 1
                    ) AS dispatcher_id,
                    SUM(wb.rate) AS total_gross,
                    SUM(wb.miles) AS total_miles,
                    BOOL_OR(wb.secondary_driver_id IS NOT NULL) AS is_team
                FROM week_boards wb
                GROUP BY wb.primary_driver_id
            ),
            event_only_drivers AS (
                SELECT
                    eb.primary_driver_id AS driver_id,
                    (
                        SELECT eb2.dispatcher_id
                        FROM event_boards eb2
                        WHERE eb2.primary_driver_id = eb.primary_driver_id
                          AND eb2.dispatcher_id IS NOT NULL
                        GROUP BY eb2.dispatcher_id
                        ORDER BY COUNT(*) DESC
                        LIMIT 1
                    ) AS dispatcher_id
                FROM event_boards eb
                WHERE eb.primary_driver_id NOT IN (SELECT driver_id FROM driver_totals)
                GROUP BY eb.primary_driver_id
            ),
            event_only_days AS (
                SELECT
                    eb.primary_driver_id AS driver_id,
                    COUNT(DISTINCT day::date) AS days_worked
                FROM event_boards eb
                JOIN event_only_drivers eod ON eod.driver_id = eb.primary_driver_id
                CROSS JOIN LATERAL generate_series(
                    GREATEST(eb.start_date, :start_date),
                    LEAST(COALESCE(eb.end_date, :end_date), :end_date),
                    '1 day'::interval
                ) AS day
                GROUP BY eb.primary_driver_id
            )
            SELECT
                dt.driver_id,
                CONCAT(drv_user.first_name, ' ', drv_user.last_name) AS driver_name,
                CONCAT(disp_user.first_name, ' ', disp_user.last_name) AS dispatcher,
                t.truck_number,
                COALESCE(dd.days_worked, 0) AS days,
                ROUND(dt.total_gross::numeric, 2) AS total_gross,
                ROUND(dt.total_miles::numeric, 2) AS total_miles,
                dt.is_team
            FROM driver_totals dt
            JOIN drivers d ON d.id = dt.driver_id AND d.is_deleted = FALSE
            JOIN users drv_user ON drv_user.id = d.user_id AND drv_user.is_deleted = FALSE
            JOIN company_users cu ON cu.user_id = drv_user.id AND cu.company_id = :company_id AND cu.is_deleted = FALSE
            LEFT JOIN trucks t ON t.id = d.current_truck_id
            LEFT JOIN dispatchers disp ON disp.id = dt.dispatcher_id AND disp.is_deleted = FALSE
            LEFT JOIN users disp_user ON disp_user.id = disp.user_id AND disp_user.is_deleted = FALSE
            LEFT JOIN driver_days dd ON dd.driver_id = dt.driver_id

            UNION ALL

            SELECT
                eod.driver_id,
                CONCAT(drv_user.first_name, ' ', drv_user.last_name) AS driver_name,
                CONCAT(disp_user.first_name, ' ', disp_user.last_name) AS dispatcher,
                t.truck_number,
                COALESCE(edd.days_worked, 0) AS days,
                0::numeric AS total_gross,
                0::numeric AS total_miles,
                FALSE AS is_team
            FROM event_only_drivers eod
            JOIN drivers d ON d.id = eod.driver_id AND d.is_deleted = FALSE
            JOIN users drv_user ON drv_user.id = d.user_id AND drv_user.is_deleted = FALSE
            JOIN company_users cu ON cu.user_id = drv_user.id AND cu.company_id = :company_id AND cu.is_deleted = FALSE
            LEFT JOIN trucks t ON t.id = d.current_truck_id
            LEFT JOIN dispatchers disp ON disp.id = eod.dispatcher_id AND disp.is_deleted = FALSE
            LEFT JOIN users disp_user ON disp_user.id = disp.user_id AND disp_user.is_deleted = FALSE
            LEFT JOIN event_only_days edd ON edd.driver_id = eod.driver_id

            ORDER BY dispatcher, driver_name
        SQL;

        $results = DB::connection('analytics')->select($sql, [
            'company_id' => $team->external_company_id,
            'start_date' => $startDate->toDateString(),
            'end_date' => $endDate->toDateString(),
            'end_date_plus_one' => $endDate->copy()->addDay()->toDateString(),
            'start_date_minus_seven' => $startDate->copy()->subDays(7)->toDateString(),
        ]);

        return collect($results);
    }

    /**
     * Compute the P&L row for a single driver.
     *
     * @param  Collection<int|string, DriverConfig>  $driverConfigs
     * @param  Collection<int, TeamExpense>  $expenses
     * @return array<string, mixed>
     */
    private function computeRow(object $row, Collection $driverConfigs, Collection $expenses): array
    {
        $driverConfig = $driverConfigs->get($row->driver_id);

        $gross = (float) $row->total_gross;
        $miles = (float) $row->total_miles;
        $rpm = $miles > 0 ? round($gross / $miles, 2) : 0.0;

        if (! $driverConfig) {
            return [
                'driver_id' => $row->driver_id,
                'driver_name' => $row->driver_name,
                'dispatcher' => $row->dispatcher,
                'truck_number' => $row->truck_number,
                'type' => null,
                'days' => (int) $row->days,
                'total_gross' => $gross,
                'total_miles' => $miles,
                'rpm' => $rpm,
                'salary' => null,
                'expenses' => [],
                'total_expenses' => null,
                'profit_loss' => null,
                'missing_config' => true,
                'is_total' => false,
            ];
        }

        $contractType = $driverConfig->contract_type;
        $salary = $driverConfig->calculateSalary($gross, $miles, (bool) $row->is_team);

        // Compute each applicable expense keyed by name.
        /** @var array<string, float> $computedExpenses */
        $computedExpenses = [];
        foreach ($expenses as $expense) {
            if ($expense->appliesToContractType($contractType)) {
                $computedExpenses[$expense->name] = $expense->calculate($gross, $miles);
            }
        }

        $totalExpenses = round(array_sum($computedExpenses), 2);
        $profitLoss = round($gross - $salary - $totalExpenses, 2);

        return [
            'driver_id' => $row->driver_id,
            'driver_name' => $row->driver_name,
            'dispatcher' => $row->dispatcher,
            'truck_number' => $row->truck_number,
            'type' => $contractType->label(),
            'days' => (int) $row->days,
            'total_gross' => $gross,
            'total_miles' => $miles,
            'rpm' => $rpm,
            'salary' => $salary,
            'expenses' => $computedExpenses,
            'total_expenses' => $totalExpenses,
            'profit_loss' => $profitLoss,
            'missing_config' => false,
            'is_total' => false,
        ];
    }

    /**
     * Get a mapping of external_driver_id → driver_name for a team.
     *
     * @return Collection<int, string>
     */
    public function getDriverNames(Team $team): Collection
    {
        $results = DB::connection('analytics')->select(
            <<<'SQL'
                SELECT d.id AS driver_id,
                       CONCAT(u.first_name, ' ', u.last_name) AS driver_name
                FROM drivers d
                JOIN users u ON u.id = d.user_id AND u.is_deleted = FALSE
                JOIN company_users cu ON cu.user_id = u.id AND cu.company_id = :company_id AND cu.is_deleted = FALSE
                WHERE d.is_deleted = FALSE
            SQL,
            ['company_id' => $team->external_company_id]
        );

        return collect($results)->pluck('driver_name', 'driver_id');
    }

    /**
     * Compute the TOTAL summary row from all driver rows.
     *
     * @param  Collection<int, array<string, mixed>>  $rows
     * @param  Collection<int, TeamExpense>  $expenses
     * @return array<string, mixed>
     */
    private function computeTotals(Collection $rows, Collection $expenses): array
    {        $configured = $rows->where('missing_config', false);
        $totalMiles = $configured->sum('total_miles');
        $totalGross = $configured->sum('total_gross');

        // Sum each expense column across all configured drivers.
        /** @var array<string, float> $expenseTotals */
        $expenseTotals = [];
        foreach ($expenses as $expense) {
            $expenseTotals[$expense->name] = round(
                $configured->sum(fn ($r) => $r['expenses'][$expense->name] ?? 0.0),
                2
            );
        }

        return [
            'driver_id' => null,
            'driver_name' => 'TOTAL',
            'dispatcher' => '',
            'truck_number' => '',
            'type' => '',
            'days' => $rows->sum('days'),
            'total_gross' => $totalGross,
            'total_miles' => $totalMiles,
            'rpm' => $totalMiles > 0 ? round($totalGross / $totalMiles, 2) : 0.0,
            'salary' => $configured->sum('salary'),
            'expenses' => $expenseTotals,
            'total_expenses' => round(array_sum($expenseTotals), 2),
            'profit_loss' => $configured->sum('profit_loss'),
            'missing_config' => false,
            'is_total' => true,
        ];
    }

    /**
     * Compute key metrics for the analytics dashboard.
     *
     * Pulls event-day data from gross_boards for the period and computes
     * compound utilization rate (non-LOAD/DRAFT event days / total event days)
     * and per-event-type breakdown.
     *
     * @return array{
     *     drivers: array{total: int, active: int, rolling: int, ready: int, inactive: int},
     *     compound_utilization_rate: float,
     *     event_breakdown: array<int, array{type: string, days: float, percentage: float}>,
     * }
     */
    public function weeklyKeyMetrics(Team $team, Carbon|CarbonImmutable $startDate, Carbon|CarbonImmutable $endDate): array
    {
        $companyId = $team->external_company_id;
        $start = $startDate->toDateString();
        $endPlusOne = $endDate->copy()->addDay()->toDateString();

        $end = $endDate->toDateString();

        // Per-event-type distinct-day counts, restricted to the company's currently
        // employment-active drivers (matches the same pool used for driver counts).
        $events = DB::connection('analytics')->select(
            <<<'SQL'
                WITH company_drivers AS (
                    SELECT d.id AS driver_id
                    FROM drivers d
                    JOIN users u ON u.id = d.user_id AND u.is_deleted = FALSE
                    JOIN company_users cu ON cu.user_id = u.id
                        AND cu.company_id = :company_id
                        AND cu.is_deleted = FALSE
                    WHERE d.is_deleted = FALSE
                ),
                boards AS (
                    SELECT
                        gb.primary_driver_id,
                        CASE
                            WHEN gb.object_type::text IN ('LOAD', 'DRAFT') THEN gb.object_type::text
                            ELSE UPPER(COALESCE(NULLIF(TRIM(gb.title), ''), 'OTHER'))
                        END AS type,
                        gb.start_date,
                        gb.end_date
                    FROM gross_boards gb
                    JOIN company_drivers cd ON cd.driver_id = gb.primary_driver_id
                    WHERE gb.is_deleted = FALSE
                      AND gb.company_id = :company_id
                      AND (
                          (
                              gb.start_date >= :start_date::timestamp
                              AND gb.start_date <= :end_date::timestamp
                              AND (gb.end_date IS NULL OR gb.end_date <= :end_date_plus_one::timestamp)
                          )
                          OR (
                              gb.start_date >= :start_date_minus_seven::timestamp
                              AND gb.start_date < :start_date::timestamp
                              AND gb.end_date > :start_date::timestamp
                          )
                      )
                ),
                expanded AS (
                    SELECT
                        b.primary_driver_id,
                        b.type,
                        day::date AS d
                    FROM boards b
                    CROSS JOIN LATERAL generate_series(
                        GREATEST(b.start_date, :start_date::timestamp),
                        LEAST(COALESCE(b.end_date, :end_date::timestamp), :end_date::timestamp),
                        '1 day'::interval
                    ) AS day
                )
                SELECT type, COUNT(*) AS total_days
                FROM (
                    SELECT DISTINCT primary_driver_id, type, d FROM expanded
                ) x
                GROUP BY type
            SQL,
            [
                'company_id' => $companyId,
                'start_date' => $start,
                'end_date' => $end,
                'end_date_plus_one' => $endPlusOne,
                'start_date_minus_seven' => $startDate->copy()->subDays(7)->toDateString(),
            ]
        );

        $byType = collect($events)->mapWithKeys(fn (object $r) => [$r->type => (float) $r->total_days]);

        // Driver counts via the analytics DB. Uses the same filters as the PnL
        // table (LOAD/DRAFT/EVENT boards overlapping the window) so totals match.
        $driverCounts = DB::connection('analytics')->select(
            <<<'SQL'
                WITH rolling_drivers AS (
                    SELECT DISTINCT gb.primary_driver_id AS driver_id
                    FROM gross_boards gb
                    JOIN drivers d ON d.id = gb.primary_driver_id AND d.is_deleted = FALSE
                    JOIN users u ON u.id = d.user_id AND u.is_deleted = FALSE
                    JOIN company_users cu ON cu.user_id = u.id
                        AND cu.company_id = :company_id
                        AND cu.is_deleted = FALSE
                    WHERE gb.is_deleted = FALSE
                      AND gb.company_id = :company_id
                      AND gb.object_type::text IN ('LOAD', 'DRAFT', 'EVENT')
                      AND (
                          (
                              gb.start_date >= :start_date::timestamp
                              AND gb.start_date <= :end_date::timestamp
                              AND (gb.end_date IS NULL OR gb.end_date <= :end_date_plus_one::timestamp)
                          )
                          OR (
                              gb.start_date >= :start_date_minus_seven::timestamp
                              AND gb.start_date < :start_date::timestamp
                              AND gb.end_date > :start_date::timestamp
                          )
                      )
                )
                SELECT (SELECT COUNT(*) FROM rolling_drivers) AS total
            SQL,
            [
                'company_id' => $companyId,
                'start_date' => $start,
                'end_date' => $end,
                'end_date_plus_one' => $endPlusOne,
                'start_date_minus_seven' => $startDate->copy()->subDays(7)->toDateString(),
            ]
        );

        $dc = $driverCounts[0] ?? null;
        $total = (int) ($dc->total ?? 0);

        // Total available driver-days in the window = total drivers * window length.
        $windowDays = (int) $startDate->copy()->startOfDay()->diffInDays($endDate->copy()->startOfDay()) + 1;
        $capacityDays = $total * $windowDays;

        $productiveDays = ($byType['LOAD'] ?? 0.0) + ($byType['DRAFT'] ?? 0.0);
        $utilizationRate = $capacityDays > 0
            ? min(100.0, ($productiveDays / $capacityDays) * 100.0)
            : 0.0;

        $breakdown = $byType
            ->except(['LOAD', 'DRAFT'])
            ->map(fn (float $days, string $type) => [
                'type' => $type,
                'days' => round($days, 2),
                'percentage' => $capacityDays > 0 ? round(($days / $capacityDays) * 100.0, 2) : 0.0,
            ])
            ->sortByDesc('days')
            ->values()
            ->all();

        return [
            'drivers' => [
                'total' => $total,
            ],
            'compound_utilization_rate' => round($utilizationRate, 2),
            'event_breakdown' => $breakdown,
        ];
    }
}
