<?php

namespace App\Http\Controllers\Analytics;

use App\Http\Controllers\Controller;
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
        $startDate = $request->date('start_date', 'Y-m-d') ?? Carbon::now()->startOfWeek();
        $endDate = $request->date('end_date', 'Y-m-d') ?? Carbon::now()->endOfWeek();

        $rows = $this->analytics->weeklyReport($currentTeam, $startDate, $endDate);

        return Inertia::render('analytics/index', [
            'rows' => $rows->values(),
            'expenses' => $currentTeam->expenses->map(fn ($e) => [
                'id' => $e->id,
                'name' => $e->name,
                'calculation_type' => $e->calculation_type->value,
            ])->values(),
            'startDate' => $startDate->toDateString(),
            'endDate' => $endDate->toDateString(),
        ]);
    }
}
