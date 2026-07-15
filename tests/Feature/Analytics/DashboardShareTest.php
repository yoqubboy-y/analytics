<?php

use App\Enums\TeamRole;
use App\Models\DashboardShare;
use App\Models\ExpenseActual;
use App\Models\Team;
use App\Services\AnalyticsService;
use Inertia\Testing\AssertableInertia as Assert;

test('members can create a share link for the current window', function () {
    [$user, $team] = createTeamMember(TeamRole::Member);

    $this
        ->actingAs($user)
        ->post(route('shares.store', $team), [
            'start_date' => '2026-05-04',
            'end_date' => '2026-05-10',
        ])
        ->assertRedirect();

    $share = $team->dashboardShares()->firstOrFail();

    expect($share->start_date->toDateString())->toBe('2026-05-04')
        ->and($share->end_date->toDateString())->toBe('2026-05-10')
        ->and($share->created_by)->toBe($user->id)
        ->and($share->widgets)->toBeNull() // no selection = whole dashboard
        ->and($share->isActive())->toBeTrue();
});

test('a share can be scoped to specific widgets', function () {
    [$user, $team] = createTeamMember(TeamRole::Member);

    $this
        ->actingAs($user)
        ->post(route('shares.store', $team), [
            'start_date' => '2026-05-04',
            'end_date' => '2026-05-10',
            'widgets' => ['key_metrics', 'pnl_table'],
        ])
        ->assertRedirect();

    expect($team->dashboardShares()->firstOrFail()->widgets)
        ->toBe(['key_metrics', 'pnl_table']);
});

test('selecting every widget is stored as the whole dashboard', function () {
    [$user, $team] = createTeamMember(TeamRole::Member);

    $this
        ->actingAs($user)
        ->post(route('shares.store', $team), [
            'start_date' => '2026-05-04',
            'end_date' => '2026-05-10',
            'widgets' => [
                'key_metrics',
                'dispatcher_chart',
                'dispatcher_rankings',
                'pnl_table',
            ],
        ])
        ->assertRedirect();

    expect($team->dashboardShares()->firstOrFail()->widgets)->toBeNull();
});

test('an unknown widget key is rejected', function () {
    [$user, $team] = createTeamMember(TeamRole::Member);

    $this
        ->actingAs($user)
        ->post(route('shares.store', $team), [
            'start_date' => '2026-05-04',
            'end_date' => '2026-05-10',
            'widgets' => ['not_a_widget'],
        ])
        ->assertSessionHasErrors('widgets.0');
});

test('viewers cannot create a share link', function () {
    [$user, $team] = createTeamMember(TeamRole::Viewer);

    $this
        ->actingAs($user)
        ->post(route('shares.store', $team), [
            'start_date' => '2026-05-04',
            'end_date' => '2026-05-10',
        ])
        ->assertForbidden();

    expect($team->dashboardShares()->count())->toBe(0);
});

test('a share link can be revoked', function () {
    [$user, $team] = createTeamMember(TeamRole::Member);
    $share = DashboardShare::factory()->for($team)->create();

    $this
        ->actingAs($user)
        ->delete(route('shares.destroy', [$team, $share]))
        ->assertRedirect();

    expect($share->fresh()->revoked_at)->not->toBeNull()
        ->and($share->fresh()->isActive())->toBeFalse();
});

test('a team cannot revoke another team share', function () {
    [$user, $team] = createTeamMember(TeamRole::Member);
    $otherShare = DashboardShare::factory()->for(Team::factory())->create();

    $this
        ->actingAs($user)
        ->delete(route('shares.destroy', [$team, $otherShare]))
        ->assertForbidden();

    expect($otherShare->fresh()->revoked_at)->toBeNull();
});

test('the public share page renders for an active link', function () {
    $this->mock(AnalyticsService::class, function ($mock) {
        $mock->shouldReceive('weeklyReport')->andReturn(collect([]));
        $mock->shouldReceive('splitByDispatcher')->andReturn(collect([]));
        $mock->shouldReceive('weeklyKeyMetrics')->andReturn([
            'drivers' => ['total' => 0],
            'compound_utilization_rate' => 0.0,
            'event_breakdown' => [],
        ]);
    });

    $team = Team::factory()->create(['name' => 'Acme Carriers']);
    $share = DashboardShare::factory()->for($team)->create();

    $this
        ->get(route('shared.show', $share))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('shared/dashboard')
            ->where('teamName', 'Acme Carriers')
        );
});

test('the public share page receives its widget scope', function () {
    $this->mock(AnalyticsService::class, function ($mock) {
        $mock->shouldReceive('weeklyReport')->andReturn(collect([]));
        $mock->shouldReceive('splitByDispatcher')->andReturn(collect([]));
        $mock->shouldReceive('weeklyKeyMetrics')->andReturn([
            'drivers' => ['total' => 0],
            'compound_utilization_rate' => 0.0,
            'event_breakdown' => [],
        ]);
    });

    $share = DashboardShare::factory()->create(['widgets' => ['pnl_table']]);

    $this
        ->get(route('shared.show', $share))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('widgets', ['pnl_table']));
});

test('a share captures the actual basis when the window has ledger coverage', function () {
    [$user, $team] = createTeamMember(TeamRole::Member);
    ExpenseActual::create(['source' => 'fuel', 'unit' => 'GL1', 'week_start' => '2026-07-06', 'amount' => 10]);

    $this
        ->actingAs($user)
        ->post(route('shares.store', $team), [
            'start_date' => '2026-07-06',
            'end_date' => '2026-07-12',
            'basis' => 'actual',
        ])
        ->assertRedirect();

    expect($team->dashboardShares()->firstOrFail()->basis)->toBe('actual');
});

test('a share requesting actual falls back to kpi when the window is uncovered', function () {
    [$user, $team] = createTeamMember(TeamRole::Member);

    $this
        ->actingAs($user)
        ->post(route('shares.store', $team), [
            'start_date' => '2026-05-04',
            'end_date' => '2026-05-10',
            'basis' => 'actual',
        ])
        ->assertRedirect();

    expect($team->dashboardShares()->firstOrFail()->basis)->toBe('kpi');
});

test('the public share page renders on its stored basis', function () {
    ExpenseActual::create(['source' => 'fuel', 'unit' => 'GL1', 'week_start' => '2026-07-06', 'amount' => 10]);

    $this->mock(AnalyticsService::class, function ($mock) {
        $mock->shouldReceive('weeklyReport')->andReturn(collect([]));
        $mock->shouldReceive('splitByDispatcher')->andReturn(collect([]));
        $mock->shouldReceive('weeklyKeyMetrics')->andReturn([
            'drivers' => ['total' => 0],
            'compound_utilization_rate' => 0.0,
            'event_breakdown' => [],
        ]);
    });

    $share = DashboardShare::factory()->create([
        'basis' => 'actual',
        'start_date' => '2026-07-06',
        'end_date' => '2026-07-12',
    ]);

    $this
        ->get(route('shared.show', $share))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('basis', 'actual'));
});

test('a revoked share link returns 404', function () {
    $share = DashboardShare::factory()->revoked()->create();

    $this->get(route('shared.show', $share))->assertNotFound();
});

test('an expired share link returns 404', function () {
    $share = DashboardShare::factory()->expired()->create();

    $this->get(route('shared.show', $share))->assertNotFound();
});
