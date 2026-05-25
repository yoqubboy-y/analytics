<?php

use App\Services\AnalyticsService;
use Carbon\Carbon;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    // Stub the service so the route never touches the external analytics DB.
    $this->mock(AnalyticsService::class, function ($mock) {
        $mock->shouldReceive('weeklyReport')->andReturn(collect([]));
        $mock->shouldReceive('weeklyKeyMetrics')->andReturn([
            'drivers' => ['total' => 0],
            'compound_utilization_rate' => 0.0,
            'event_breakdown' => [],
        ]);
    });
});

test('analytics defaults to the current week', function () {
    Carbon::setTestNow('2026-05-20');
    [$user, $team] = createTeamMember();

    $this
        ->actingAs($user)
        ->get(route('analytics.index', $team))
        ->assertInertia(fn (Assert $page) => $page
            ->component('analytics/index')
            ->where('startDate', Carbon::now()->startOfWeek()->toDateString())
            ->where('endDate', Carbon::now()->endOfWeek()->toDateString())
        );

    Carbon::setTestNow();
});

test('analytics honours an arbitrary date range', function () {
    [$user, $team] = createTeamMember();

    $this
        ->actingAs($user)
        ->get(route('analytics.index', ['current_team' => $team, 'start_date' => '2026-03-01', 'end_date' => '2026-03-31']))
        ->assertInertia(fn (Assert $page) => $page
            ->where('startDate', '2026-03-01')
            ->where('endDate', '2026-03-31')
        );
});

test('analytics swaps a reversed range', function () {
    [$user, $team] = createTeamMember();

    $this
        ->actingAs($user)
        ->get(route('analytics.index', ['current_team' => $team, 'start_date' => '2026-03-31', 'end_date' => '2026-03-01']))
        ->assertInertia(fn (Assert $page) => $page
            ->where('startDate', '2026-03-01')
            ->where('endDate', '2026-03-31')
        );
});

test('analytics clamps an excessively long range', function () {
    [$user, $team] = createTeamMember();

    $this
        ->actingAs($user)
        ->get(route('analytics.index', ['current_team' => $team, 'start_date' => '2026-01-01', 'end_date' => '2030-01-01']))
        ->assertInertia(fn (Assert $page) => $page
            ->where('startDate', '2026-01-01')
            ->where('endDate', Carbon::parse('2026-01-01')->addDays(366)->toDateString())
        );
});
