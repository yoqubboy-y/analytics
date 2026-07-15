<?php

namespace App\Http\Controllers\Analytics;

use App\Enums\TeamRole;
use App\Http\Controllers\Controller;
use App\Models\Team;
use App\Services\AnalyticsService;
use Carbon\Carbon;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Inertia\Inertia;
use Inertia\Response;

class AnalyticsComparisonController extends Controller
{
    public function __construct(private AnalyticsService $analytics) {}

    /**
     * Side-by-side comparison of two teams the current user belongs to.
     * One shared date range drives both columns; widgets are the same
     * `KeyMetrics` / `DispatcherChart` / `DispatcherRankings` / `PnlTable`
     * used on the per-team dashboard, just rendered twice.
     */
    public function show(Request $request): Response
    {
        $user = $request->user();

        // The user's non-personal teams, sorted by id for a stable default.
        $accessibleTeams = $user->teams()
            ->get()
            ->filter(fn (Team $t) => ! $t->is_personal)
            ->sortBy('id')
            ->values();

        $teamA = $this->resolveTeam($request->query('team_a'), $accessibleTeams, 0, $user);
        $teamB = $this->resolveTeam($request->query('team_b'), $accessibleTeams, 1, $user);

        // Default to the current week, but honour any explicit range.
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

        return Inertia::render('analytics/compare', [
            'startDate' => $startDate->toDateString(),
            'endDate' => $endDate->toDateString(),
            'availableTeams' => $accessibleTeams
                ->map(fn (Team $t) => ['slug' => $t->slug, 'name' => $t->name])
                ->values(),
            'teams' => [
                $teamA ? $this->payloadFor($teamA, $startDate, $endDate, $user) : null,
                $teamB ? $this->payloadFor($teamB, $startDate, $endDate, $user) : null,
            ],
        ]);
    }

    /**
     * @param  Collection<int, Team>  $accessibleTeams
     */
    private function resolveTeam(mixed $slug, Collection $accessibleTeams, int $fallbackIndex, $user): ?Team
    {
        if (is_string($slug) && $slug !== '') {
            $team = Team::where('slug', $slug)->first();
            abort_unless($team && $user->belongsToTeam($team), 403);

            return $team;
        }

        return $accessibleTeams->get($fallbackIndex);
    }

    /**
     * @return array<string, mixed>
     */
    private function payloadFor(Team $team, Carbon|CarbonImmutable $start, Carbon|CarbonImmutable $end, $user): array
    {
        $rows = $this->analytics->weeklyReport($team, $start, $end);
        $dispatcherRows = $this->analytics->splitByDispatcher($team, $rows, $start, $end);
        $keyMetrics = $this->analytics->weeklyKeyMetrics($team, $start, $end);

        $canManage = $user->teamRole($team)?->isAtLeast(TeamRole::Member) ?? false;

        return [
            'slug' => $team->slug,
            'name' => $team->name,
            'dataSource' => $team->data_source->value,
            'rows' => $rows->values(),
            'dispatcherRows' => $dispatcherRows->values(),
            'keyMetrics' => $keyMetrics,
            // Comparison is KPI-only, so drop Actual-only expenses from the columns.
            'expenses' => $team->expenses
                ->filter(fn ($e) => $e->applies_to_kpi)
                ->map(fn ($e) => [
                    'id' => $e->id,
                    'name' => $e->name,
                    'description' => $e->description,
                    'calculation_type' => $e->calculation_type->value,
                ])->values(),
            'canManage' => $canManage,
        ];
    }
}
