<?php

namespace App\Http\Controllers\Analytics;

use App\Enums\TeamDataSource;
use App\Http\Controllers\Controller;
use App\Models\Team;
use App\Services\AnalyticsService;
use Carbon\Carbon;
use Carbon\CarbonImmutable;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Inertia\Inertia;
use Inertia\Response;

class OverviewController extends Controller
{
    public function __construct(private AnalyticsService $analytics) {}

    /**
     * Company-wide roll-up across every team the user belongs to: summed gross
     * / miles / net (net only where a team is configured) plus a per-team
     * scorecard that links into each team's own analytics. A user in a single
     * team skips this and lands straight on that team.
     */
    public function index(Request $request): Response|RedirectResponse
    {
        $user = $request->user();

        /** @var Collection<int, Team> $teams */
        $teams = $user->teams()
            ->get()
            ->filter(fn (Team $t) => ! $t->is_personal)
            ->sortBy('id')
            ->values();

        // Nothing to aggregate for one team — drop straight into it. Fall back
        // to any resolvable team so a bare user still lands somewhere sensible.
        if ($teams->count() <= 1) {
            $target = $teams->first() ?? $user->currentTeam ?? $user->fallbackTeam();

            return $target
                ? redirect("/{$target->slug}/analytics")
                : redirect()->route('home');
        }

        // Defaults to the current week; any explicit range is honoured.
        $startDate = $request->date('start_date', 'Y-m-d') ?? Carbon::now()->startOfWeek();
        $endDate = $request->date('end_date', 'Y-m-d') ?? Carbon::now()->endOfWeek();

        if ($startDate->greaterThan($endDate)) {
            [$startDate, $endDate] = [$endDate, $startDate];
        }

        // Cap pathological spans — matches AnalyticsController's guard.
        $maxRangeDays = 366;
        if ((int) $startDate->diffInDays($endDate) > $maxRangeDays) {
            $endDate = $startDate->copy()->addDays($maxRangeDays);
        }

        $teamCards = $teams
            ->map(fn (Team $team) => $this->summarize($team, $startDate, $endDate))
            ->values();

        // Net only rolls up teams that are fully configured; a partially- or
        // un-configured team (gross-only) must not pretend to contribute net.
        $netContributors = $teamCards->where('net', '!==', null);

        // Fleet-wide utilization is driver-weighted, not a flat average of the
        // per-team rates — a 2-driver team shouldn't swing it like a 100-driver
        // one. Window length is common to all teams, so weighting by driver
        // count is equivalent to (Σ productive days / Σ capacity).
        $totalDrivers = (int) $teamCards->sum('drivers');
        $utilization = $totalDrivers > 0
            ? round($teamCards->sum(fn (array $c) => $c['utilization'] * $c['drivers']) / $totalDrivers, 1)
            : 0.0;

        return Inertia::render('overview', [
            'startDate' => $startDate->toDateString(),
            'endDate' => $endDate->toDateString(),
            'company' => [
                'teams' => $teamCards->count(),
                'gross' => round((float) $teamCards->sum('gross'), 2),
                'miles' => round((float) $teamCards->sum('miles'), 2),
                'drivers' => $totalDrivers,
                'net' => $netContributors->isEmpty() ? null : round((float) $netContributors->sum('net'), 2),
                'net_partial' => $netContributors->count() < $teamCards->count(),
                'utilization' => $utilization,
            ],
            'teams' => $teamCards,
        ]);
    }

    /**
     * Per-team scorecard for the window. Gross/miles/drivers cover every
     * driver; net is summed only from configured drivers and is null when the
     * team has none, so the UI can mark it "gross-only".
     *
     * @return array<string, mixed>
     */
    private function summarize(Team $team, Carbon|CarbonImmutable $start, Carbon|CarbonImmutable $end): array
    {
        $rows = $this->analytics->weeklyReport($team, $start, $end)
            ->where('is_total', false);
        $keyMetrics = $this->analytics->weeklyKeyMetrics($team, $start, $end);

        $configured = $rows->where('missing_config', false);
        $gross = (float) $rows->sum('total_gross');
        $miles = (float) $rows->sum('total_miles');

        // XLSX teams are only as current as their last upload; analytics-DB
        // teams stream live from the TMS, so there is no "through" date.
        $lastUpload = $team->data_source === TeamDataSource::Xlsx
            ? $team->xlsxDriverDays()->max('work_date')
            : null;

        return [
            'slug' => $team->slug,
            'name' => $team->name,
            'data_source' => $team->data_source->value,
            'gross' => round($gross, 2),
            'miles' => round($miles, 2),
            'rpm' => $miles > 0 ? round($gross / $miles, 2) : 0.0,
            'drivers' => (int) ($keyMetrics['drivers']['total'] ?? 0),
            'configured_drivers' => $configured->count(),
            'unconfigured_drivers' => $rows->where('missing_config', true)->count(),
            // Net is only meaningful when at least one driver is configured.
            'net' => $configured->isEmpty() ? null : round((float) $configured->sum('profit_loss'), 2),
            'utilization' => (float) ($keyMetrics['compound_utilization_rate'] ?? 0.0),
            'data_through' => $lastUpload ? (string) $lastUpload : null,
            'is_live' => $team->data_source === TeamDataSource::AnalyticsDb,
        ];
    }
}
