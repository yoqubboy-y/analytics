<?php

namespace App\Http\Controllers\Analytics;

use App\Enums\TeamRole;
use App\Http\Controllers\Controller;
use App\Models\DashboardShare;
use App\Models\Team;
use App\Services\AnalyticsService;
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

        $rows = $this->analytics->weeklyReport($currentTeam, $startDate, $endDate);
        $keyMetrics = $this->analytics->weeklyKeyMetrics($currentTeam, $startDate, $endDate);

        // Sharing/downloads are for Members and above; Viewers never see them.
        $canManage = $request->user()->teamRole($currentTeam)?->isAtLeast(TeamRole::Member) ?? false;

        return Inertia::render('analytics/index', [
            'rows' => $rows->values(),
            'keyMetrics' => $keyMetrics,
            'expenses' => $currentTeam->expenses->map(fn ($e) => [
                'id' => $e->id,
                'name' => $e->name,
                'calculation_type' => $e->calculation_type->value,
            ])->values(),
            'startDate' => $startDate->toDateString(),
            'endDate' => $endDate->toDateString(),
            'canManage' => $canManage,
            'shares' => $canManage ? $this->activeShares($currentTeam) : [],
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
