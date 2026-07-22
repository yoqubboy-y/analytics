<?php

namespace App\Services;

use App\Enums\DriverAssignmentKind;
use App\Enums\ExpenseActualSource;
use App\Enums\ExpenseCalculationType;
use App\Enums\TeamDataSource;
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
     * Event titles that represent productive work (the driver is moving
     * with intent — running a load even though the board isn't a LOAD /
     * DRAFT). Counted as productive in the utilization rate and excluded
     * from the event breakdown.
     */
    private const PRODUCTIVE_EVENT_TITLES = ['TRANSIT', 'ENROUTE'];

    /**
     * Actual-basis expenses that roll up into the "Fleet Exp." card: the
     * hand-attributed per-unit fleet cost plus the flat shared fleet cost.
     * KPI uses the rate-based Fleet Maintenance instead (see fleetExpenseNames).
     */
    public const ACTUAL_FLEET_EXPENSE_NAMES = ['Fleet Expenditure', 'Shared Fleet Expenses'];

    /**
     * The expense-column names summed into the "Fleet Exp." metric for a basis.
     * Actual: the hand-attributed + shared fleet expenses (Actual-only). KPI:
     * the rate-based expense flagged `actual_source = Fleet`. Only names that
     * actually exist on the team are returned, preserving the team's order.
     *
     * @return array<int, string>
     */
    public static function fleetExpenseNames(Team $team, string $basis): array
    {
        if ($basis === 'actual') {
            return $team->expenses
                ->pluck('name')
                ->intersect(self::ACTUAL_FLEET_EXPENSE_NAMES)
                ->values()
                ->all();
        }

        return $team->expenses
            ->filter(fn (TeamExpense $e) => $e->actual_source === ExpenseActualSource::Fleet)
            ->pluck('name')
            ->values()
            ->all();
    }

    /**
     * Get weekly P&L report rows for a team.
     *
     * Fetches raw financial data from the analytics DB, merges with local
     * driver configs, and computes P&L using the team's expense list.
     *
     * @return Collection<int, array<string, mixed>>
     */
    public function weeklyReport(Team $team, Carbon|CarbonImmutable $startDate, Carbon|CarbonImmutable $endDate, string $basis = 'kpi'): Collection
    {
        if ($team->data_source === TeamDataSource::Xlsx) {
            return $this->weeklyReportFromXlsx($team, $startDate, $endDate, $basis);
        }

        /** @var Collection<int, TeamExpense> $expenses */
        $expenses = $team->expenses->load('rates');

        /** @var Collection<int|string, DriverConfig> $driverConfigs */
        $driverConfigs = $team->driverConfigs->load('rates', 'assignments')->keyBy('external_driver_id');

        // Under actual basis, preload the real per-unit expense data once.
        $actuals = $basis === 'actual' ? ExpenseActualsLookup::forWindow($startDate, $endDate) : null;

        // ...and the hand-entered attributions for any manual expenses.
        $attributions = $basis === 'actual' && $expenses->contains(fn (TeamExpense $e) => $e->is_manual)
            ? ManualAttributionLookup::forWindow($expenses->pluck('id')->all(), $startDate, $endDate)
            : null;

        $rows = $this->fetchRawData($team, $startDate, $endDate);

        // Per-(driver, week) gross & miles, so salary and expenses can be summed
        // week by week — each week resolving its own rate, and flat (weekly)
        // expenses accumulating across the window.
        $weeklyByDriver = $this->fetchWeeklyData($team, $startDate, $endDate)->groupBy('driver_id');

        // Per-driver set of ISO weeks the driver was active (had any LOAD /
        // DRAFT / EVENT board assigned to that week). Flat expenses are only
        // charged for these weeks — otherwise a multi-week window bills every
        // flat expense once per calendar week even for weeks the driver never
        // worked. This is our employment-active proxy in the absence of
        // contract_start_date / contract_end_date in this DB version.
        $activeWeeksByDriver = $this->fetchActiveWeeks($team, $startDate, $endDate);

        // Per-driver count of productive-event (TRANSIT / ENROUTE) days so
        // the per-dispatcher widgets can fold them into their utilization
        // calc, the same way KeyMetrics already does for the team total.
        $productiveEventDaysByDriver = $this->fetchProductiveEventDays($team, $startDate, $endDate);

        $rows->each(function (object $row) use ($productiveEventDaysByDriver) {
            $row->productive_event_days = (int) ($productiveEventDaysByDriver[$row->driver_id] ?? 0);
        });

        $windowWeeks = $this->windowWeeks($startDate, $endDate);

        $driverRows = $rows->map(fn (object $row) => $this->computeRow(
            $row,
            $driverConfigs,
            $expenses,
            $weeklyByDriver->get($row->driver_id, collect()),
            $windowWeeks,
            $activeWeeksByDriver[$row->driver_id] ?? [],
            $basis,
            $actuals,
            $attributions,
        ));

        $totals = $this->computeTotals($driverRows, $expenses);

        return $driverRows->push($totals);
    }

    /**
     * Per-dispatcher rows for the Dispatcher Rankings / Chart widgets.
     *
     * The per-driver P&L rows attribute a driver's whole-window gross to a
     * single "mode" dispatcher. That is fine for a one-week view (a driver
     * rarely changes dispatcher inside a week) but misallocates over longer
     * ranges: a driver who moved from dispatcher A to B mid-month has ALL
     * their gross credited to whichever ran more loads. This splits each such
     * driver per (driver, ISO-week) to that week's dispatcher, so gross, miles
     * and net all land on the dispatcher who actually ran the week. Drivers
     * with a single dispatcher pass through unchanged.
     *
     * @return Collection<int, array<string, mixed>>
     */
    public function dispatcherRows(Team $team, Carbon|CarbonImmutable $startDate, Carbon|CarbonImmutable $endDate): Collection
    {
        return $this->splitByDispatcher($team, $this->weeklyReport($team, $startDate, $endDate), $startDate, $endDate);
    }

    /**
     * Split already-computed per-driver P&L rows into per-(driver, dispatcher)
     * rows using each ISO week's actual dispatcher. The TOTAL row is dropped
     * (rankings ignore it); `missing_config` rows pass through untouched.
     *
     * @param  Collection<int, array<string, mixed>>  $rows
     * @return Collection<int, array<string, mixed>>
     */
    public function splitByDispatcher(Team $team, Collection $rows, Carbon|CarbonImmutable $startDate, Carbon|CarbonImmutable $endDate): Collection
    {
        // XLSX-backed teams identify one dispatcher per driver (from config or
        // the sheet), so there is nothing to split — just drop the TOTAL row.
        if ($team->data_source === TeamDataSource::Xlsx) {
            return $rows->reject(fn (array $r) => $r['is_total'])->values();
        }

        /** @var Collection<int, Collection<int, object>> $weeklyByDriver */
        $weeklyByDriver = $this->fetchWeeklyDispatcher($team, $startDate, $endDate)->groupBy('driver_id');

        /** @var Collection<int, TeamExpense> $expenses */
        $expenses = $team->expenses->load('rates');

        /** @var Collection<int|string, DriverConfig> $driverConfigs */
        $driverConfigs = $team->driverConfigs->load('rates')->keyBy('external_driver_id');

        $activeWeeksByDriver = $this->fetchActiveWeeks($team, $startDate, $endDate);

        $out = collect();

        foreach ($rows as $row) {
            if ($row['is_total']) {
                continue;
            }

            /** @var Collection<int, object> $buckets */
            $buckets = $weeklyByDriver->get($row['driver_id'], collect());
            $distinctDispatchers = $buckets->pluck('dispatcher')->map(fn ($d) => (string) $d)->unique();

            // Single-dispatcher (or event-only / missing-config) drivers keep
            // their existing row verbatim.
            if ($row['missing_config'] || $buckets->isEmpty() || $distinctDispatchers->count() <= 1) {
                $out->push($row);

                continue;
            }

            $config = $driverConfigs->get($row['driver_id']);

            if (! $config) {
                $out->push($row);

                continue;
            }

            foreach ($this->splitConfiguredRow($row, $buckets, $config, $expenses, $activeWeeksByDriver[$row['driver_id']] ?? []) as $splitRow) {
                $out->push($splitRow);
            }
        }

        return $out->values();
    }

    /**
     * Split one configured driver's row across the dispatchers who ran them,
     * week by week. Gross/miles/salary/expenses are partitioned by ISO week
     * (each week belongs to exactly one dispatcher), so the per-dispatcher
     * pieces sum back to the driver's original totals. Day counts (used only
     * for utilization) are split proportionally by each dispatcher's share of
     * the driver's gross weeks.
     *
     * @param  array<string, mixed>  $row
     * @param  Collection<int, object>  $buckets  per-week gross/miles/dispatcher for this driver
     * @param  Collection<int, TeamExpense>  $expenses
     * @param  array<int, string>  $activeWeeks  week-start dates this driver had any board
     * @return array<int, array<string, mixed>>
     */
    public function splitConfiguredRow(array $row, Collection $buckets, DriverConfig $config, Collection $expenses, array $activeWeeks): array
    {
        /** @var Collection<string, Collection<int, object>> $byDispatcher */
        $byDispatcher = $buckets->groupBy(fn (object $b) => (string) $b->dispatcher);

        // Primary dispatcher = the one who ran the most of this driver's gross.
        // Event-only active weeks (no gross bucket) are billed to them so flat
        // expenses stay accounted for and the pieces still sum to the total.
        $primary = $byDispatcher
            ->map(fn (Collection $group) => (float) $group->sum('week_gross'))
            ->sortDesc()
            ->keys()
            ->first();

        // Which dispatcher "owns" each active week for flat-expense billing.
        $weekOwner = [];
        foreach ($buckets as $bucket) {
            $weekOwner[(string) $bucket->week_start] = (string) $bucket->dispatcher;
        }
        foreach ($activeWeeks as $week) {
            if (! isset($weekOwner[$week])) {
                $weekOwner[$week] = $primary;
            }
        }

        // Proportional day-count split by each dispatcher's gross-week count.
        $grossWeekCounts = $byDispatcher
            ->map(fn (Collection $group) => $group->pluck('week_start')->unique()->count())
            ->all();
        $daysByDispatcher = $this->proportionalSplit((int) $row['days'], $grossWeekCounts);
        $eventDaysByDispatcher = $this->proportionalSplit((int) ($row['productive_event_days'] ?? 0), $grossWeekCounts);

        $result = [];

        foreach ($byDispatcher as $dispatcher => $group) {
            $ownedWeeks = array_values(array_keys(array_filter($weekOwner, fn (string $owner) => $owner === $dispatcher)));
            $windowWeeksForDispatcher = array_map(fn (string $w) => CarbonImmutable::parse($w), $ownedWeeks);

            $financials = $this->computeFinancials($config, $expenses, $group->values(), $windowWeeksForDispatcher, $ownedWeeks);

            $gross = round((float) $group->sum('week_gross'), 2);
            $miles = round((float) $group->sum('week_miles'), 2);
            $profitLoss = round($gross - $financials['salary'] - $financials['total_expenses'], 2);

            $result[] = [
                'driver_id' => $row['driver_id'],
                'driver_name' => $row['driver_name'],
                'dispatcher' => $dispatcher,
                'truck_number' => $row['truck_number'],
                'type' => $row['type'],
                'days' => $daysByDispatcher[$dispatcher] ?? 0,
                'productive_event_days' => $eventDaysByDispatcher[$dispatcher] ?? 0,
                'total_gross' => $gross,
                'total_miles' => $miles,
                'rpm' => $miles > 0 ? round($gross / $miles, 2) : 0.0,
                'salary' => $financials['salary'],
                'expenses' => $financials['expenses'],
                'total_expenses' => round($financials['total_expenses'] + $financials['salary'], 2),
                'profit_loss' => $profitLoss,
                'missing_config' => false,
                'is_total' => false,
            ];
        }

        return $result;
    }

    /**
     * Distribute an integer total across weighted buckets using the largest-
     * remainder method so the parts always sum back to the original total.
     *
     * @param  array<string, int>  $weights
     * @return array<string, int>
     */
    private function proportionalSplit(int $total, array $weights): array
    {
        $weightSum = array_sum($weights);

        if ($total <= 0 || $weightSum <= 0) {
            return array_map(fn () => 0, $weights);
        }

        $floors = [];
        $remainders = [];
        foreach ($weights as $key => $weight) {
            $exact = $total * $weight / $weightSum;
            $floors[$key] = (int) floor($exact);
            $remainders[$key] = $exact - $floors[$key];
        }

        $left = $total - array_sum($floors);
        arsort($remainders);
        foreach (array_keys($remainders) as $key) {
            if ($left <= 0) {
                break;
            }
            $floors[$key]++;
            $left--;
        }

        return $floors;
    }

    /**
     * Per-(driver, ISO-week) gross, miles and the week's dispatcher. Reuses the
     * exact board set and week-bump rule as {@see fetchWeeklyData} so the two
     * stay in lockstep; the dispatcher is the one who ran the most of that
     * driver's LOAD/DRAFT boards in the week.
     *
     * @return Collection<int, object>
     */
    private function fetchWeeklyDispatcher(Team $team, Carbon|CarbonImmutable $startDate, Carbon|CarbonImmutable $endDate): Collection
    {
        $sql = <<<'SQL'
            WITH week_boards AS (
                SELECT
                    gb.primary_driver_id,
                    gb.dispatcher_id,
                    gb.rate,
                    gb.miles,
                    CASE
                        WHEN gb.end_date IS NULL
                          OR gb.end_date::date <= (date_trunc('week', gb.start_date)::date + 7)
                        THEN date_trunc('week', gb.start_date)::date
                        ELSE date_trunc('week', gb.start_date)::date + 7
                    END AS week_start
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
            mode_dispatcher AS (
                SELECT
                    primary_driver_id,
                    week_start,
                    dispatcher_id,
                    ROW_NUMBER() OVER (
                        PARTITION BY primary_driver_id, week_start
                        ORDER BY COUNT(*) DESC, dispatcher_id
                    ) AS rn
                FROM week_boards
                WHERE dispatcher_id IS NOT NULL
                GROUP BY primary_driver_id, week_start, dispatcher_id
            )
            SELECT
                wb.primary_driver_id AS driver_id,
                wb.week_start,
                ROUND(SUM(wb.rate)::numeric, 2) AS week_gross,
                ROUND(SUM(wb.miles)::numeric, 2) AS week_miles,
                TRIM(MAX(CONCAT(disp_user.first_name, ' ', disp_user.last_name))) AS dispatcher
            FROM week_boards wb
            LEFT JOIN mode_dispatcher md
                ON md.primary_driver_id = wb.primary_driver_id
               AND md.week_start = wb.week_start
               AND md.rn = 1
            LEFT JOIN dispatchers disp ON disp.id = md.dispatcher_id AND disp.is_deleted = FALSE
            LEFT JOIN users disp_user ON disp_user.id = disp.user_id AND disp_user.is_deleted = FALSE
            GROUP BY wb.primary_driver_id, wb.week_start
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
     * Get the Monday of every ISO week that overlaps the report window.
     *
     * @return array<int, CarbonImmutable>
     */
    private function windowWeeks(Carbon|CarbonImmutable $startDate, Carbon|CarbonImmutable $endDate): array
    {
        $weeks = [];
        $cursor = CarbonImmutable::parse($startDate->toDateString())->startOfWeek();
        $last = CarbonImmutable::parse($endDate->toDateString());

        while ($cursor->lessThanOrEqualTo($last)) {
            $weeks[] = $cursor;
            $cursor = $cursor->addWeek();
        }

        return $weeks;
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
     * Fetch per-(driver, week) gross & miles from the analytics database.
     *
     * Buckets each board into its *assigned* ISO week, mirroring prod's
     * `belongs_to_week_range`: a board belongs to the Monday-week of its start
     * date, unless it ends after the following Monday, in which case it is
     * bumped one week forward (it "ran past the cutoff"). Summed across weeks
     * this equals the per-driver totals from fetchRawData.
     *
     * @return Collection<int, object>
     */
    private function fetchWeeklyData(Team $team, Carbon|CarbonImmutable $startDate, Carbon|CarbonImmutable $endDate): Collection
    {
        $sql = <<<'SQL'
            WITH week_boards AS (
                SELECT
                    gb.primary_driver_id,
                    gb.rate,
                    gb.miles,
                    CASE
                        WHEN gb.end_date IS NULL
                          OR gb.end_date::date <= (date_trunc('week', gb.start_date)::date + 7)
                        THEN date_trunc('week', gb.start_date)::date
                        ELSE date_trunc('week', gb.start_date)::date + 7
                    END AS week_start
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
            )
            SELECT
                wb.primary_driver_id AS driver_id,
                wb.week_start,
                ROUND(SUM(wb.rate)::numeric, 2) AS week_gross,
                ROUND(SUM(wb.miles)::numeric, 2) AS week_miles
            FROM week_boards wb
            GROUP BY wb.primary_driver_id, wb.week_start
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
     * Per driver, the set of ISO weeks (Monday date strings) in which the
     * driver had ANY board — LOAD, DRAFT or EVENT — assigned to that week.
     * Week assignment uses the same `belongs_to_week_range` rule as
     * fetchWeeklyData so a board's active week matches the week its gross
     * lands in.
     *
     * Used to gate flat (weekly) expenses: a driver is only charged a flat
     * expense for weeks they were actually active, so widening the report
     * window no longer bills idle weeks.
     *
     * @return array<int, array<int, string>> driver_id => list of week-start dates
     */
    private function fetchActiveWeeks(Team $team, Carbon|CarbonImmutable $startDate, Carbon|CarbonImmutable $endDate): array
    {
        $sql = <<<'SQL'
            WITH boards AS (
                SELECT
                    gb.primary_driver_id,
                    CASE
                        WHEN gb.end_date IS NULL
                          OR gb.end_date::date <= (date_trunc('week', gb.start_date)::date + 7)
                        THEN date_trunc('week', gb.start_date)::date
                        ELSE date_trunc('week', gb.start_date)::date + 7
                    END AS week_start
                FROM gross_boards gb
                WHERE gb.is_deleted = FALSE
                  AND gb.object_type::text IN ('LOAD', 'DRAFT', 'EVENT')
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
            )
            SELECT DISTINCT primary_driver_id AS driver_id, week_start
            FROM boards
        SQL;

        $results = DB::connection('analytics')->select($sql, [
            'company_id' => $team->external_company_id,
            'start_date' => $startDate->toDateString(),
            'end_date' => $endDate->toDateString(),
            'end_date_plus_one' => $endDate->copy()->addDay()->toDateString(),
            'start_date_minus_seven' => $startDate->copy()->subDays(7)->toDateString(),
        ]);

        return collect($results)
            ->groupBy('driver_id')
            ->map(fn (Collection $weeks) => $weeks
                ->map(fn (object $r) => (string) $r->week_start)
                ->all())
            ->all();
    }

    /**
     * Count, per driver, the distinct days in the window spent on EVENT
     * boards whose title is "productive" (TRANSIT / ENROUTE). These add to
     * utilization for the per-dispatcher widgets the same way they already
     * do for the team-wide KeyMetrics number.
     *
     * @return array<int, int> driver_id => day count
     */
    private function fetchProductiveEventDays(Team $team, Carbon|CarbonImmutable $startDate, Carbon|CarbonImmutable $endDate): array
    {
        // Build the IN-list dynamically from the constant so adding a new
        // productive title doesn't require touching the SQL.
        $titles = "'".implode("','", array_map('strtoupper', self::PRODUCTIVE_EVENT_TITLES))."'";

        $sql = <<<SQL
            WITH productive_event_boards AS (
                SELECT
                    gb.primary_driver_id,
                    gb.start_date,
                    gb.end_date
                FROM gross_boards gb
                WHERE gb.is_deleted = FALSE
                  AND gb.object_type::text = 'EVENT'
                  AND gb.company_id = :company_id
                  AND UPPER(TRIM(gb.title)) IN ($titles)
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
                    day::date AS d
                FROM productive_event_boards b
                CROSS JOIN LATERAL generate_series(
                    GREATEST(b.start_date, :start_date::timestamp),
                    LEAST(COALESCE(b.end_date, :end_date::timestamp), :end_date::timestamp),
                    '1 day'::interval
                ) AS day
            )
            SELECT primary_driver_id AS driver_id, COUNT(*) AS days
            FROM (SELECT DISTINCT primary_driver_id, d FROM expanded) x
            GROUP BY primary_driver_id
        SQL;

        $results = DB::connection('analytics')->select($sql, [
            'company_id' => $team->external_company_id,
            'start_date' => $startDate->toDateString(),
            'end_date' => $endDate->toDateString(),
            'end_date_plus_one' => $endDate->copy()->addDay()->toDateString(),
            'start_date_minus_seven' => $startDate->copy()->subDays(7)->toDateString(),
        ]);

        return collect($results)
            ->mapWithKeys(fn (object $r) => [(int) $r->driver_id => (int) $r->days])
            ->all();
    }

    /**
     * Compute the P&L row for a single driver.
     *
     * @param  Collection<int|string, DriverConfig>  $driverConfigs
     * @param  Collection<int, TeamExpense>  $expenses
     * @param  Collection<int, object>  $weeklyBuckets  per-week gross/miles for this driver
     * @param  array<int, CarbonImmutable>  $windowWeeks  Monday of each ISO week in the window
     * @param  array<int, string>  $activeWeeks  week-start dates this driver was active
     * @return array<string, mixed>
     */
    private function computeRow(object $row, Collection $driverConfigs, Collection $expenses, Collection $weeklyBuckets, array $windowWeeks, array $activeWeeks, string $basis = 'kpi', ?ExpenseActualsLookup $actuals = null, ?ManualAttributionLookup $attributions = null): array
    {
        $driverConfig = $driverConfigs->get($row->driver_id);

        $gross = (float) $row->total_gross;
        $miles = (float) $row->total_miles;
        $rpm = $miles > 0 ? round($gross / $miles, 2) : 0.0;

        // A driver with no config — or whose tariff history never covers the
        // window — is treated as unconfigured: we cannot compute their P&L.
        $hasTariff = $driverConfig
            && $weeklyBuckets->contains(fn (object $b) => $driverConfig->tariffRateAsOf(CarbonImmutable::parse($b->week_start)) !== null);

        if (! $driverConfig || (! $hasTariff && $weeklyBuckets->isNotEmpty())) {
            return [
                'driver_id' => $row->driver_id,
                'driver_name' => $row->driver_name,
                'dispatcher' => $row->dispatcher,
                'truck_number' => $row->truck_number,
                'type' => $driverConfig?->contract_type->label(),
                'days' => (int) $row->days,
                'productive_event_days' => (int) ($row->productive_event_days ?? 0),
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

        // analytics_db teams have no per-week truck history; the current truck
        // (from the TMS join) is the actual-mode fallback and is accurate for
        // the recent covered weeks.
        $financials = $this->computeFinancials($driverConfig, $expenses, $weeklyBuckets, $windowWeeks, $activeWeeks, $basis, $row->truck_number ?? null, $actuals, $attributions);

        $profitLoss = round($gross - $financials['salary'] - $financials['total_expenses'], 2);

        // The displayed "Total Exp." column rolls salary inside so the row
        // reads as `Gross − Total Exp. = P&L`. The per-expense breakdown
        // (`expenses` map) and the `salary` column stay unchanged.
        $totalExpensesWithSalary = round($financials['total_expenses'] + $financials['salary'], 2);

        // Prefer the config's time-versioned truck assignment (as of the period
        // end) over the live TMS truck, which only reflects the driver's
        // *current* unit and is wrong for past periods. Falls back to the live
        // truck where no assignment covers the window, so drivers without one are
        // unchanged. This mirrors how the actual-expense resolution already picks
        // the unit, keeping the displayed truck and the dollars in agreement.
        $displayWeek = end($windowWeeks) ?: null;
        $displayTruck = $displayWeek
            ? ($driverConfig->assignmentAsOf(DriverAssignmentKind::Truck, $displayWeek) ?? $row->truck_number)
            : $row->truck_number;

        return [
            'driver_id' => $row->driver_id,
            'driver_name' => $row->driver_name,
            'dispatcher' => $row->dispatcher,
            'truck_number' => $displayTruck,
            'type' => $driverConfig->contract_type->label(),
            'days' => (int) $row->days,
            'productive_event_days' => (int) ($row->productive_event_days ?? 0),
            'total_gross' => $gross,
            'total_miles' => $miles,
            'rpm' => $rpm,
            'salary' => $financials['salary'],
            'expenses' => $financials['expenses'],
            'total_expenses' => $totalExpensesWithSalary,
            'profit_loss' => $profitLoss,
            'missing_config' => false,
            'is_total' => false,
        ];
    }

    /**
     * Compute salary and expenses for a driver by summing week by week.
     *
     * Salary and variable expenses (per-mile, % of gross) are computed on each
     * data week's gross/miles using that week's rate. Flat expenses are weekly
     * charges accrued once per ISO week the driver was *active* (in
     * `$activeWeeks`), so they scale with how long the driver worked rather
     * than with the raw window length. `skip_when_no_gross` is evaluated per
     * week, matching its intent.
     *
     * @param  Collection<int, TeamExpense>  $expenses
     * @param  Collection<int, object>  $weeklyBuckets  per-week gross/miles for this driver
     * @param  array<int, CarbonImmutable>  $windowWeeks  Monday of each ISO week in the window
     * @param  array<int, string>  $activeWeeks  week-start dates this driver had any board
     * @return array{salary: float, expenses: array<string, float>, total_expenses: float}
     */
    public function computeFinancials(DriverConfig $driverConfig, Collection $expenses, Collection $weeklyBuckets, array $windowWeeks, array $activeWeeks, string $basis = 'kpi', ?string $fallbackTruck = null, ?ExpenseActualsLookup $actuals = null, ?ManualAttributionLookup $attributions = null): array
    {
        // Fast lookup for "was the driver active this week?" flat-expense gating.
        $activeWeekSet = array_flip($activeWeeks);

        $contractType = $driverConfig->contract_type;

        // Index this driver's weekly gross by ISO-week Monday for flat gating.
        /** @var array<string, float> $grossByWeek */
        $grossByWeek = $weeklyBuckets
            ->mapWithKeys(fn (object $b) => [CarbonImmutable::parse($b->week_start)->toDateString() => (float) $b->week_gross])
            ->all();

        // Salary: sum each data week at that week's tariff.
        $salary = 0.0;
        foreach ($weeklyBuckets as $bucket) {
            $weekStart = CarbonImmutable::parse($bucket->week_start);
            $tariff = $driverConfig->tariffRateAsOf($weekStart);

            if ($tariff !== null) {
                $salary += $driverConfig->calculateSalary($tariff, (float) $bucket->week_gross, (float) $bucket->week_miles, false);
            }
        }
        $salary = round($salary, 2);

        /** @var array<string, float> $computedExpenses */
        $computedExpenses = [];
        // Only the carrier-paid portion of each expense reduces the carrier
        // P&L. Driver-paid (`isDriverPaidFor`) amounts are pass-through
        // recoveries and stay out of `total_expenses` even though they're
        // still rendered as -$X cells for the driver's settlement view.
        $totalCarrierCost = 0.0;

        foreach ($expenses as $expense) {
            // Manual expenses (Actual basis) are attributed by hand, per driver
            // per week — no contract-type gate, no rate, no unit match. Whoever
            // has an attribution gets it, even in a zero-gross week. company-paid
            // lands as a carrier cost; driver-paid renders negative and stays out
            // of Total Exp., exactly like `isDriverPaidFor` for rated expenses;
            // "none" (Unbilled) shows as a number but is billed to no party, so
            // it feeds the displayed cell without touching Total Exp. / P&L.
            if ($basis === 'actual' && $expense->is_manual && $attributions !== null) {
                $companyAmount = 0.0;
                $driverAmount = 0.0;
                $neutralAmount = 0.0;
                $charged = false;

                foreach ($windowWeeks as $weekStart) {
                    $sums = $attributions->amountFor($expense->id, $driverConfig->id, $weekStart);

                    if ($sums === null) {
                        continue;
                    }

                    $companyAmount += $sums['company'];
                    $driverAmount += $sums['driver'];
                    $neutralAmount += $sums['none'];
                    $charged = true;
                }

                if ($charged) {
                    // Only the company portion is a real carrier cost. The
                    // displayed cell also carries the Unbilled number (positive)
                    // and nets the driver-paid credit — but P&L sees company only.
                    $computedExpenses[$expense->name] = round($companyAmount - $driverAmount + $neutralAmount, 2);
                    $totalCarrierCost += $companyAmount;
                }

                continue;
            }

            if (! $expense->appliesToContractType($contractType)) {
                continue;
            }

            // Each basis includes its own set of expenses. In Actual mode an
            // expense is included when marked "Include in Actual" — this now
            // governs the ledger-backed (Real $) expenses too, so a Fleet
            // Maintenance can be hidden from Actual without being deleted.
            // (Manual expenses are handled by the branch above and never reach
            // here.) In KPI mode an expense is included unless it has been marked
            // Actual-only (applies_to_kpi = false). Excluded expenses drop out of
            // that basis' figure entirely.
            if ($basis === 'actual') {
                if (! $expense->applies_to_actual && ! $expense->is_manual) {
                    continue;
                }
            } elseif (! $expense->applies_to_kpi) {
                continue;
            }

            $amount = 0.0;
            $charged = false;

            if ($expense->calculation_type === ExpenseCalculationType::Flat) {
                // Flat is a weekly charge: accrue once per ISO week the driver
                // was active. Weeks with no board activity are skipped so a
                // wider window doesn't bill idle weeks (a driver who only ran
                // one week is charged one week of flat, not the whole span).
                foreach ($windowWeeks as $weekStart) {
                    $weekKey = $weekStart->toDateString();

                    if (! isset($activeWeekSet[$weekKey])) {
                        continue;
                    }

                    $weekGross = $grossByWeek[$weekKey] ?? 0.0;

                    if ($expense->skip_when_no_gross && $weekGross <= 0) {
                        continue;
                    }

                    $weekAmount = $this->expenseWeekAmount($expense, $driverConfig, $weekStart, $weekGross, 0.0, $basis, $fallbackTruck, $actuals);

                    if ($weekAmount === null) {
                        continue;
                    }

                    $amount += $weekAmount;
                    $charged = true;
                }
            } else {
                // Variable expenses scale with each data week's gross/miles.
                foreach ($weeklyBuckets as $bucket) {
                    $weekStart = CarbonImmutable::parse($bucket->week_start);
                    $weekGross = (float) $bucket->week_gross;

                    if ($expense->skip_when_no_gross && $weekGross <= 0) {
                        continue;
                    }

                    $weekAmount = $this->expenseWeekAmount($expense, $driverConfig, $weekStart, $weekGross, (float) $bucket->week_miles, $basis, $fallbackTruck, $actuals);

                    if ($weekAmount === null) {
                        continue;
                    }

                    $amount += $weekAmount;
                    $charged = true;
                }
            }

            if ($charged) {
                $isDriverPaid = $expense->isDriverPaidFor($contractType);

                // The cell is displayed as -$X when the driver covers, so
                // settlement deductions stay visible on the row. But the
                // expense is a pass-through (carrier paid the vendor, driver
                // reimbursed via salary), so it's cost-neutral to the carrier
                // and must NOT count toward `total_expenses` — otherwise the
                // reimbursement is treated as new profit.
                $computedExpenses[$expense->name] = round(
                    $isDriverPaid ? -$amount : $amount,
                    2,
                );

                if (! $isDriverPaid) {
                    $totalCarrierCost += $amount;
                }
            }
        }

        return [
            'salary' => $salary,
            'expenses' => $computedExpenses,
            'total_expenses' => round($totalCarrierCost, 2),
        ];
    }

    /**
     * The amount to charge one expense for one week. Under `basis=actual`, an
     * expense with an `actual_source` uses the real per-unit dollars for the
     * driver's truck/trailer that week (null → $0: no cost recorded); everything
     * else, and the whole KPI basis, uses the configured rate. Returns null only
     * when the configured rate resolves to null (not charged), preserving the
     * existing "skip this week" behaviour.
     */
    private function expenseWeekAmount(TeamExpense $expense, DriverConfig $driverConfig, CarbonImmutable $weekStart, float $weekGross, float $weekMiles, string $basis, ?string $fallbackTruck, ?ExpenseActualsLookup $actuals): ?float
    {
        $source = $expense->actual_source;

        if ($basis === 'actual' && $source !== null && $actuals !== null) {
            $truck = $driverConfig->assignmentAsOf(DriverAssignmentKind::Truck, $weekStart) ?? $fallbackTruck;
            $trailer = $driverConfig->assignmentAsOf(DriverAssignmentKind::Trailer, $weekStart);

            return $actuals->amountFor($source, $truck, $trailer, $weekStart) ?? 0.0;
        }

        $rate = $expense->rateAsOf($weekStart);

        return $rate === null ? null : $expense->calculate($rate, $weekGross, $weekMiles);
    }

    /**
     * Get a mapping of external_driver_id → driver_name for a team.
     *
     * @return Collection<int, string>
     */
    public function getDriverNames(Team $team): Collection
    {
        if ($team->data_source === TeamDataSource::Xlsx) {
            // XLSX-backed teams don't pull from the analytics DB; an empty
            // map keeps `ConfigurationController` happy (it falls back to
            // "Driver #{id}" labels for any unmatched configs).
            return collect();
        }

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
    {
        $configured = $rows->where('missing_config', false);
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

        $totalSalary = (float) $configured->sum('salary');

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
            'salary' => $totalSalary,
            'expenses' => $expenseTotals,
            // Sum per-row carrier-net Total Exp. so driver-paid pass-throughs
            // stay out of the math (they're cost-neutral). Identity
            // `Gross − Total Exp. = P&L` continues to hold on the TOTAL row.
            'total_expenses' => round((float) $configured->sum('total_expenses'), 2),
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
        if ($team->data_source === TeamDataSource::Xlsx) {
            return $this->weeklyKeyMetricsFromXlsx($team, $startDate, $endDate);
        }

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

        // TRANSIT / ENROUTE are part of running a load, not lost time — fold
        // them into productive days and exclude from the breakdown so they
        // don't appear to deduct from utilization.
        $productiveDays = ($byType['LOAD'] ?? 0.0) + ($byType['DRAFT'] ?? 0.0);
        foreach (self::PRODUCTIVE_EVENT_TITLES as $productiveTitle) {
            $productiveDays += $byType[$productiveTitle] ?? 0.0;
        }
        $utilizationRate = $capacityDays > 0
            ? min(100.0, ($productiveDays / $capacityDays) * 100.0)
            : 0.0;

        $breakdown = $byType
            ->except(array_merge(['LOAD', 'DRAFT'], self::PRODUCTIVE_EVENT_TITLES))
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

    /**
     * Build the weekly P&L report for an XLSX-backed team. Aggregates
     * `xlsx_driver_days` rows by driver (name + truck), mirroring the shape
     * of the analytics-DB path. Salary, expenses, and P&L are deferred —
     * every driver row is flagged `missing_config` until DriverConfig
     * matching for XLSX teams is wired up.
     *
     * @return Collection<int, array<string, mixed>>
     */
    private function weeklyReportFromXlsx(Team $team, Carbon|CarbonImmutable $startDate, Carbon|CarbonImmutable $endDate, string $basis = 'kpi'): Collection
    {
        /** @var Collection<int, TeamExpense> $expenses */
        $expenses = $team->expenses->load('rates');

        // XLSX teams identify drivers by the same `xlsxDriverKey()` string
        // we use to group imported rows.
        /** @var Collection<string, DriverConfig> $driverConfigs */
        $driverConfigs = $team->driverConfigs->load('rates', 'assignments')->keyBy('external_driver_key');

        // Under actual basis, preload the real per-unit expense data once.
        $actuals = $basis === 'actual' ? ExpenseActualsLookup::forWindow($startDate, $endDate) : null;

        // ...and the hand-entered attributions for any manual expenses.
        $attributions = $basis === 'actual' && $expenses->contains(fn (TeamExpense $e) => $e->is_manual)
            ? ManualAttributionLookup::forWindow($expenses->pluck('id')->all(), $startDate, $endDate)
            : null;

        $rows = $team->xlsxDriverDays()
            ->whereBetween('work_date', [$startDate->toDateString(), $endDate->toDateString()])
            ->get();

        // Group by driver — driver_name + truck_number is the natural identity
        // in the imported sheets. Trim and case-normalise so the same driver
        // across weeks aggregates cleanly.
        $grouped = $rows->groupBy(fn ($r) => $this->xlsxDriverKey($r->driver_name, $r->truck_number));

        $windowWeeks = $this->windowWeeks($startDate, $endDate);

        $driverRows = $grouped->map(function (Collection $group, string $driverKey) use ($driverConfigs, $expenses, $windowWeeks, $basis, $actuals, $attributions, $endDate) {
            $first = $group->first();
            $gross = (float) $group->sum('gross');
            $miles = (float) $group->sum('miles');
            // "Productive" days are the distinct workdates where revenue ran.
            $days = $group->filter(fn ($r) => (float) $r->gross > 0)
                ->pluck('work_date')
                ->map(fn ($d) => (string) $d)
                ->unique()
                ->count();

            // Distinct workdates spent in a "productive event" status
            // (TRANSIT / ENROUTE). These add to utilization in the
            // per-dispatcher widgets, the same as KeyMetrics.
            $productiveEventDays = $group
                ->filter(fn ($r) => (float) $r->gross <= 0
                    && in_array(strtoupper(trim((string) ($r->status ?? ''))), self::PRODUCTIVE_EVENT_TITLES, true))
                ->pluck('work_date')
                ->map(fn ($d) => (string) $d)
                ->unique()
                ->count();

            $rpm = $miles > 0 ? round($gross / $miles, 2) : 0.0;
            $driverConfig = $driverConfigs->get($driverKey);

            // Some imported sheets omit the unit, leaving the day-rows' truck
            // blank; the truck then lives only in the driver's time-versioned
            // assignment. Fall back to that assignment (as of the window end) so
            // the board shows the unit instead of a dash. Display-only — the
            // per-week P&L/actuals already resolve the truck from the assignment.
            $displayTruck = filled($first->truck_number)
                ? $first->truck_number
                : ($driverConfig?->assignmentAsOf(DriverAssignmentKind::Truck, $endDate) ?? $first->truck_number);

            // Build per-(driver, ISO week) buckets so salary & expenses use
            // each week's own gross/miles/tariff (matching the analytics-DB
            // path's `fetchWeeklyData` shape).
            $weeklyBuckets = $group
                ->groupBy(fn ($r) => CarbonImmutable::parse((string) $r->work_date)->startOfWeek()->toDateString())
                ->map(fn (Collection $weekRows, string $weekStart) => (object) [
                    'week_start' => $weekStart,
                    'week_gross' => (float) $weekRows->sum('gross'),
                    'week_miles' => (float) $weekRows->sum('miles'),
                ])
                ->values();

            $hasTariff = $driverConfig
                && $weeklyBuckets->contains(fn (object $b) => $driverConfig->tariffRateAsOf(CarbonImmutable::parse($b->week_start)) !== null);

            if (! $driverConfig || (! $hasTariff && $weeklyBuckets->isNotEmpty())) {
                return [
                    'driver_id' => $this->xlsxDriverPseudoId($first->driver_name, $first->truck_number),
                    'external_driver_key' => $driverKey,
                    'driver_name' => $first->driver_name,
                    'dispatcher' => $driverConfig?->dispatcher ?? $first->dispatcher,
                    'truck_number' => $displayTruck,
                    'type' => $driverConfig?->contract_type->label(),
                    'days' => $days,
                    'productive_event_days' => $productiveEventDays,
                    'total_gross' => round($gross, 2),
                    'total_miles' => round($miles, 2),
                    'rpm' => $rpm,
                    'salary' => null,
                    'expenses' => [],
                    'total_expenses' => null,
                    'profit_loss' => null,
                    'missing_config' => true,
                    'is_total' => false,
                ];
            }

            // Active weeks = every ISO week the driver has an imported row
            // (gross or status), so flat expenses are gated to weeks the driver
            // actually appears in the sheet — same rule as the analytics-DB path.
            $activeWeeks = $weeklyBuckets->pluck('week_start')->all();

            // XLSX identity is name+truck, so the group's truck is the per-week
            // fallback; a configured assignment history refines it per week.
            $financials = $this->computeFinancials($driverConfig, $expenses, $weeklyBuckets, $windowWeeks, $activeWeeks, $basis, $first->truck_number, $actuals, $attributions);
            $profitLoss = round($gross - $financials['salary'] - $financials['total_expenses'], 2);
            $totalExpensesWithSalary = round($financials['total_expenses'] + $financials['salary'], 2);

            return [
                'driver_id' => $this->xlsxDriverPseudoId($first->driver_name, $first->truck_number),
                'external_driver_key' => $driverKey,
                'driver_name' => $first->driver_name,
                'dispatcher' => $driverConfig->dispatcher ?? $first->dispatcher,
                'truck_number' => $displayTruck,
                'type' => $driverConfig->contract_type->label(),
                'days' => $days,
                'productive_event_days' => $productiveEventDays,
                'total_gross' => round($gross, 2),
                'total_miles' => round($miles, 2),
                'rpm' => $rpm,
                'salary' => $financials['salary'],
                'expenses' => $financials['expenses'],
                'total_expenses' => $totalExpensesWithSalary,
                'profit_loss' => $profitLoss,
                'missing_config' => false,
                'is_total' => false,
            ];
        })
            ->values()
            ->sortBy([
                ['dispatcher', 'asc'],
                ['driver_name', 'asc'],
            ])
            ->values();

        $totals = $this->computeXlsxTotals($driverRows, $expenses);

        return $driverRows->push($totals);
    }

    /**
     * Per-team TOTAL row for XLSX-backed reports. Unlike `computeTotals` it
     * does not exclude `missing_config` rows from money sums, since for
     * XLSX teams every row is currently flagged that way.
     *
     * @param  Collection<int, array<string, mixed>>  $rows
     * @return array<string, mixed>
     */
    private function computeXlsxTotals(Collection $rows, Collection $expenses): array
    {
        $configured = $rows->where('missing_config', false);

        // Money totals (gross/miles/days) come from EVERY row so unconfigured
        // drivers' fleet contribution stays visible; salary/expenses/P&L only
        // come from configured rows since the others have null financials.
        $totalGross = (float) $rows->sum('total_gross');
        $totalMiles = (float) $rows->sum('total_miles');

        /** @var array<string, float> $expenseTotals */
        $expenseTotals = [];
        foreach ($expenses as $expense) {
            $expenseTotals[$expense->name] = round(
                $configured->sum(fn ($r) => $r['expenses'][$expense->name] ?? 0.0),
                2
            );
        }
        $hasFinancials = $configured->isNotEmpty();
        $totalSalary = (float) $configured->sum('salary');

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
            'salary' => $hasFinancials ? $totalSalary : null,
            'expenses' => $expenseTotals,
            // Sum per-row carrier-net Total Exp. so driver-paid pass-throughs
            // stay out of the math (they're cost-neutral). Identity
            // `Gross − Total Exp. = P&L` continues to hold on the TOTAL row.
            'total_expenses' => $hasFinancials ? round((float) $configured->sum('total_expenses'), 2) : null,
            'profit_loss' => $hasFinancials ? $configured->sum('profit_loss') : null,
            'missing_config' => false,
            'is_total' => true,
        ];
    }

    /**
     * Stable grouping key for a driver inside a single team's import.
     * Combines normalised name + truck — multiple "John Smith" entries can
     * exist on different trucks; one driver moving trucks within a window
     * splits into separate rows by design.
     */
    public function xlsxDriverKey(string $driverName, ?string $truckNumber): string
    {
        $name = strtolower(preg_replace('/\s+/', ' ', trim($driverName)) ?: $driverName);
        $truck = strtoupper(trim($truckNumber ?? ''));

        return $name.'|'.$truck;
    }

    /**
     * 32-bit pseudo-id derived from the driver key. The frontend uses
     * `driver_id` as a Set key for unique-driver counts; collisions across
     * teams don't matter since rows are always rendered within one team.
     */
    private function xlsxDriverPseudoId(string $driverName, ?string $truckNumber): int
    {
        return crc32($this->xlsxDriverKey($driverName, $truckNumber));
    }

    /**
     * Compute KeyMetrics for an XLSX-backed team. Uses the imported daily
     * rows directly: productive driver-days come from rows with `gross > 0`,
     * event driver-days from `status`-only rows (HOME / TRANSIT / REST / …).
     *
     * @return array{
     *     drivers: array{total: int},
     *     compound_utilization_rate: float,
     *     event_breakdown: array<int, array{type: string, days: float, percentage: float}>,
     * }
     */
    private function weeklyKeyMetricsFromXlsx(Team $team, Carbon|CarbonImmutable $startDate, Carbon|CarbonImmutable $endDate): array
    {
        $rows = $team->xlsxDriverDays()
            ->whereBetween('work_date', [$startDate->toDateString(), $endDate->toDateString()])
            ->get();

        // Distinct drivers active in this window.
        $totalDrivers = $rows
            ->map(fn ($r) => $this->xlsxDriverKey($r->driver_name, $r->truck_number))
            ->unique()
            ->count();

        // Normalise the status cell once so both filters below see the same
        // bucket key.
        $normalizeStatus = fn ($r) => strtoupper(trim((string) ($r->status ?? '')));

        // Productive driver-days: any gross ran OR the day was spent in a
        // status that represents active load work (TRANSIT / ENROUTE).
        $productivePairs = $rows
            ->filter(fn ($r) => (float) $r->gross > 0
                || in_array($normalizeStatus($r), self::PRODUCTIVE_EVENT_TITLES, true))
            ->map(fn ($r) => $this->xlsxDriverKey($r->driver_name, $r->truck_number).'|'.(string) $r->work_date)
            ->unique();
        $productiveDays = $productivePairs->count();

        // Per-status driver-day buckets (collapsing per-(driver, date)).
        // TRANSIT / ENROUTE are already folded into productive above, so
        // they don't appear here either.
        $eventBuckets = $rows
            ->filter(fn ($r) => (float) $r->gross <= 0
                && $r->status
                && ! in_array($normalizeStatus($r), self::PRODUCTIVE_EVENT_TITLES, true))
            ->groupBy(fn ($r) => $normalizeStatus($r))
            ->map(fn (Collection $group) => $group
                ->map(fn ($r) => $this->xlsxDriverKey($r->driver_name, $r->truck_number).'|'.(string) $r->work_date)
                ->unique()
                ->count()
            );

        $windowDays = (int) $startDate->copy()->startOfDay()->diffInDays($endDate->copy()->startOfDay()) + 1;
        $capacityDays = $totalDrivers * $windowDays;

        $utilizationRate = $capacityDays > 0
            ? min(100.0, ($productiveDays / $capacityDays) * 100.0)
            : 0.0;

        $breakdown = $eventBuckets
            ->map(fn (int $days, string $type) => [
                'type' => $type,
                'days' => (float) $days,
                'percentage' => $capacityDays > 0 ? round(($days / $capacityDays) * 100.0, 2) : 0.0,
            ])
            ->sortByDesc('days')
            ->values()
            ->all();

        return [
            'drivers' => [
                'total' => $totalDrivers,
            ],
            'compound_utilization_rate' => round($utilizationRate, 2),
            'event_breakdown' => $breakdown,
        ];
    }
}
