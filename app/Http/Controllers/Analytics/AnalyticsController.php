<?php

namespace App\Http\Controllers\Analytics;

use App\Enums\DriverContractType;
use App\Enums\TeamDataSource;
use App\Enums\TeamRole;
use App\Http\Controllers\Controller;
use App\Models\DashboardShare;
use App\Models\Team;
use App\Services\AnalyticsService;
use App\Services\ExpenseActualsLookup;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class AnalyticsController extends Controller
{
    public function __construct(private AnalyticsService $analytics) {}

    public function index(Request $request, Team $currentTeam): Response
    {
        // Defaults to the current week, but any explicit range is honoured —
        // biweekly, multi-week, monthly, or fully custom.
        $startDate = $request->date('start_date', 'Y-m-d') ?? Carbon::now()->startOfWeek();
        $endDate = $request->date('end_date', 'Y-m-d') ?? Carbon::now()->endOfWeek();

        if ($startDate->greaterThan($endDate)) {
            [$startDate, $endDate] = [$endDate, $startDate];
        }

        // Cap pathological spans so a single request can't hammer the analytics
        // DB with years of generate_series. A year is well beyond normal use.
        $maxRangeDays = 366;
        if ((int) $startDate->diffInDays($endDate) > $maxRangeDays) {
            $endDate = $startDate->copy()->addDays($maxRangeDays);
        }

        // Actual (factual) basis swaps the per-unit expenses for real dollars,
        // but only when every week in the range has ledger coverage. Otherwise
        // the request silently falls back to KPI.
        $coveredWeeks = ExpenseActualsLookup::coveredWeeks();
        $actualAvailable = $coveredWeeks !== null
            && $startDate->copy()->startOfWeek()->toDateString() >= $coveredWeeks[0]
            && $endDate->copy()->startOfWeek()->toDateString() <= $coveredWeeks[1];
        $basis = ($request->string('basis')->toString() === 'actual' && $actualAvailable) ? 'actual' : 'kpi';

        $rows = $this->analytics->weeklyReport($currentTeam, $startDate, $endDate, $basis);

        // Per-dispatcher rows for the ranking/chart widgets — always KPI (fair
        // comparison is their point). splitByDispatcher passes non-split drivers
        // through verbatim, so it must be fed KPI rows, not the P&L basis.
        $kpiRows = $basis === 'actual'
            ? $this->analytics->weeklyReport($currentTeam, $startDate, $endDate, 'kpi')
            : $rows;
        $dispatcherRows = $this->analytics->splitByDispatcher($currentTeam, $kpiRows, $startDate, $endDate);

        $keyMetrics = $this->analytics->weeklyKeyMetrics($currentTeam, $startDate, $endDate);

        // Sharing/downloads are for Members and above; Viewers never see them.
        $canManage = $request->user()->teamRole($currentTeam)?->isAtLeast(TeamRole::Member) ?? false;

        // Drivers/contracts data so an inline "Configure" dialog can open
        // straight from a missing-config row in the PnL table — no need to
        // jump to the Configuration page for the common case.
        $importedDrivers = $currentTeam->data_source === TeamDataSource::Xlsx
            ? $currentTeam->xlsxDriverDays()
                ->selectRaw('driver_name, truck_number')
                ->groupBy('driver_name', 'truck_number')
                ->orderBy('driver_name')
                ->get()
                ->map(fn ($row) => [
                    'external_driver_key' => $this->analytics->xlsxDriverKey($row->driver_name, $row->truck_number),
                    'driver_name' => $row->driver_name,
                    'truck_number' => $row->truck_number,
                ])
                ->values()
            : collect();

        $takenDriverKeys = $currentTeam->driverConfigs()
            ->whereNotNull('external_driver_key')
            ->pluck('external_driver_key')
            ->all();

        return Inertia::render('analytics/index', [
            'rows' => $rows->values(),
            'dispatcherRows' => $dispatcherRows->values(),
            'keyMetrics' => $keyMetrics,
            // In Actual mode, only columns that belong in the factual P&L are
            // shown: the actual-backed expenses plus any expense marked "applies
            // to actual". KPI-only estimates drop out so the table matches the
            // computed rows (which exclude them too).
            'expenses' => $currentTeam->expenses
                ->filter(fn ($e) => $basis !== 'actual' || $e->actual_source !== null || $e->applies_to_actual)
                ->map(fn ($e) => [
                    'id' => $e->id,
                    'name' => $e->name,
                    'calculation_type' => $e->calculation_type->value,
                ])->values(),
            'startDate' => $startDate->toDateString(),
            'endDate' => $endDate->toDateString(),
            'basis' => $basis,
            'actualAvailable' => $actualAvailable,
            'coveredRange' => $coveredWeeks,
            'canManage' => $canManage,
            'shares' => $canManage ? $this->activeShares($currentTeam) : [],
            'dataSource' => $currentTeam->data_source->value,
            'contractTypes' => array_map(fn ($c) => [
                'value' => $c->value,
                'label' => $c->label(),
            ], DriverContractType::cases()),
            'importedDrivers' => $importedDrivers,
            'takenDriverKeys' => $takenDriverKeys,
        ]);
    }

    /**
     * Active (non-revoked, non-expired) share links for the team.
     *
     * @return array<int, array<string, mixed>>
     */
    private function activeShares(Team $team): array
    {
        return $team->dashboardShares()
            ->whereNull('revoked_at')
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->latest()
            ->get()
            ->map(fn (DashboardShare $share) => [
                'token' => $share->token,
                'url' => route('shared.show', $share),
                'start_date' => $share->start_date->toDateString(),
                'end_date' => $share->end_date->toDateString(),
                'widgets' => $share->widgets,
                'expires_at' => $share->expires_at?->toISOString(),
                'created_at' => $share->created_at->toISOString(),
            ])
            ->all();
    }
}
