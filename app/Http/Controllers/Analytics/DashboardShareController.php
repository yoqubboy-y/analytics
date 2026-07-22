<?php

namespace App\Http\Controllers\Analytics;

use App\Enums\ExpenseActualSource;
use App\Http\Controllers\Controller;
use App\Models\DashboardShare;
use App\Models\Team;
use App\Services\AnalyticsService;
use App\Services\ExpenseActualsLookup;
use Carbon\Carbon;
use Carbon\CarbonInterface;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class DashboardShareController extends Controller
{
    public function __construct(private AnalyticsService $analytics) {}

    /**
     * Create a public, revocable share link for the current dashboard window.
     */
    public function store(Request $request, Team $currentTeam): RedirectResponse
    {
        $data = $request->validate([
            'start_date' => ['required', 'date'],
            'end_date' => ['required', 'date'],
            'basis' => ['nullable', Rule::in(['kpi', 'actual'])],
            'expires_at' => ['nullable', 'date', 'after:now'],
            'widgets' => ['nullable', 'array'],
            'widgets.*' => ['string', Rule::in(DashboardShare::WIDGETS)],
        ]);

        $start = Carbon::parse($data['start_date']);
        $end = Carbon::parse($data['end_date']);

        if ($start->greaterThan($end)) {
            [$start, $end] = [$end, $start];
        }

        // Mirror the dashboard's own clamp so a share can't pin a pathological span.
        if ((int) $start->diffInDays($end) > 366) {
            $end = $start->copy()->addDays(366);
        }

        $currentTeam->dashboardShares()->create([
            'token' => Str::random(40),
            'start_date' => $start->toDateString(),
            'end_date' => $end->toDateString(),
            // Persist the basis the sharer was viewing, but only honour "actual"
            // when the window has ledger coverage (same rule as the dashboard).
            'basis' => $this->resolveBasis($data['basis'] ?? 'kpi', $start, $end),
            'widgets' => $this->normalizeWidgets($data['widgets'] ?? []),
            'created_by' => $request->user()->id,
            'expires_at' => $data['expires_at'] ?? null,
        ]);

        Inertia::flash('toast', ['type' => 'success', 'message' => __('Share link created.')]);

        return back();
    }

    /**
     * Revoke a share link.
     */
    public function destroy(Team $currentTeam, DashboardShare $share): RedirectResponse
    {
        abort_unless($share->team_id === $currentTeam->id, 403);

        $share->update(['revoked_at' => now()]);

        Inertia::flash('toast', ['type' => 'success', 'message' => __('Share link revoked.')]);

        return back();
    }

    /**
     * Render the public, read-only dashboard for an active share link.
     *
     * Data is recomputed live for the share's fixed window.
     */
    public function show(DashboardShare $share): Response
    {
        abort_unless($share->isActive(), 404);

        $team = $share->team;
        $startDate = $share->start_date;
        $endDate = $share->end_date;

        // Reproduce the basis the share was created on, re-gated on coverage in
        // case the ledger window changed since it was shared.
        $basis = $this->resolveBasis($share->basis ?? 'kpi', $startDate, $endDate);

        $rows = $this->analytics->weeklyReport($team, $startDate, $endDate, $basis);

        // Dispatcher widgets are always KPI (fair comparison); feed them a KPI
        // row set, never the actual-basis rows.
        $kpiRows = $basis === 'actual'
            ? $this->analytics->weeklyReport($team, $startDate, $endDate, 'kpi')
            : $rows;
        $dispatcherRows = $this->analytics->splitByDispatcher($team, $kpiRows, $startDate, $endDate);
        $keyMetrics = $this->analytics->weeklyKeyMetrics($team, $startDate, $endDate);

        return Inertia::render('shared/dashboard', [
            'teamName' => $team->name,
            'rows' => $rows->values(),
            'dispatcherRows' => $dispatcherRows->values(),
            'keyMetrics' => $keyMetrics,
            // Only the columns belonging to this basis, matching the computed rows.
            'expenses' => $team->expenses
                ->filter(fn ($e) => $basis === 'actual'
                    ? ($e->is_manual || $e->applies_to_actual)
                    : $e->applies_to_kpi)
                ->map(fn ($e) => [
                    'id' => $e->id,
                    'name' => $e->name,
                    'description' => $e->description,
                    'calculation_type' => $e->calculation_type->value,
                ])->values(),
            'startDate' => $startDate->toDateString(),
            'endDate' => $endDate->toDateString(),
            'basis' => $basis,
            'fleetExpenseName' => $team->expenses
                ->first(fn ($e) => $e->actual_source === ExpenseActualSource::Fleet)?->name,
            'widgets' => $share->widgets,
        ]);
    }

    /**
     * Honour "actual" only when every week in the window has ledger coverage;
     * otherwise fall back to "kpi" (same rule as the analytics dashboard).
     */
    private function resolveBasis(string $requested, CarbonInterface $start, CarbonInterface $end): string
    {
        if ($requested !== 'actual') {
            return 'kpi';
        }

        $covered = ExpenseActualsLookup::coveredWeeks();

        $available = $covered !== null
            && $start->copy()->startOfWeek()->toDateString() >= $covered[0]
            && $end->copy()->startOfWeek()->toDateString() <= $covered[1];

        return $available ? 'actual' : 'kpi';
    }

    /**
     * Reduce a requested widget selection to a stored value: null means the
     * whole dashboard (nothing chosen, or everything chosen).
     *
     * @param  array<int, string>  $widgets
     * @return array<int, string>|null
     */
    private function normalizeWidgets(array $widgets): ?array
    {
        $selected = array_values(array_unique(
            array_filter($widgets, fn (string $w) => in_array($w, DashboardShare::WIDGETS, true))
        ));

        return (count($selected) === 0 || count($selected) === count(DashboardShare::WIDGETS))
            ? null
            : $selected;
    }
}
