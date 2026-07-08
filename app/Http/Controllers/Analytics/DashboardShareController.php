<?php

namespace App\Http\Controllers\Analytics;

use App\Http\Controllers\Controller;
use App\Models\DashboardShare;
use App\Models\Team;
use App\Services\AnalyticsService;
use Carbon\Carbon;
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

        $rows = $this->analytics->weeklyReport($team, $startDate, $endDate);
        $dispatcherRows = $this->analytics->splitByDispatcher($team, $rows, $startDate, $endDate);
        $keyMetrics = $this->analytics->weeklyKeyMetrics($team, $startDate, $endDate);

        return Inertia::render('shared/dashboard', [
            'teamName' => $team->name,
            'rows' => $rows->values(),
            'dispatcherRows' => $dispatcherRows->values(),
            'keyMetrics' => $keyMetrics,
            'expenses' => $team->expenses->map(fn ($e) => [
                'id' => $e->id,
                'name' => $e->name,
                'calculation_type' => $e->calculation_type->value,
            ])->values(),
            'startDate' => $startDate->toDateString(),
            'endDate' => $endDate->toDateString(),
            'widgets' => $share->widgets,
        ]);
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
