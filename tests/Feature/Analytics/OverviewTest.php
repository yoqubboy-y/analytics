<?php

use App\Enums\DriverContractType;
use App\Enums\TeamDataSource;
use App\Enums\TeamRole;
use App\Models\DriverConfig;
use App\Models\ExpenseActual;
use App\Models\Team;
use App\Models\User;
use App\Models\XlsxDriverDay;
use Carbon\CarbonImmutable;

/** Attach a non-personal XLSX team to the user with a week of gross. */
function xlsxTeamFor(User $user, float $gross): Team
{
    $team = Team::factory()->create([
        'is_personal' => false,
        'data_source' => TeamDataSource::Xlsx,
    ]);
    $team->members()->attach($user, ['role' => TeamRole::Owner->value]);

    XlsxDriverDay::create([
        'team_id' => $team->id,
        'work_date' => CarbonImmutable::now()->startOfWeek()->toDateString(),
        'driver_name' => 'Test Driver',
        'truck_number' => 'GL0001',
        'gross' => $gross,
        'miles' => 100,
        'source_format' => 'test',
    ]);

    return $team;
}

test('a multi-team user sees the company overview with rolled-up gross', function () {
    $user = User::factory()->create();
    xlsxTeamFor($user, 1000);
    xlsxTeamFor($user, 500);

    $this->actingAs($user)
        ->get(route('overview'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('overview')
            ->where('company.teams', 2)
            ->where('company.gross', 1500)
            // No configs on either team → net can't be computed for the company.
            ->where('company.net', null)
            // Both teams ran 1 productive day in a 7-day window → ~14.3%.
            ->where('company.utilization', fn ($v) => (float) $v > 0)
            ->has('teams', 2));
});

test('per-truck averages and margin are internally consistent for a configured team', function () {
    $user = User::factory()->create();
    xlsxTeamFor($user, 500); // second team so the overview renders

    $week = CarbonImmutable::now()->startOfWeek()->toDateString();
    $team = Team::factory()->create(['is_personal' => false, 'data_source' => TeamDataSource::Xlsx]);
    $team->members()->attach($user, ['role' => TeamRole::Owner->value]);
    $config = DriverConfig::factory()->for($team)->create([
        'contract_type' => DriverContractType::CompanyCpm,
        'external_driver_key' => 'jane doe|GL0009',
    ]);
    $config->rates()->create(['tariff_rate' => 0.50, 'effective_from' => $week]);
    XlsxDriverDay::create([
        'team_id' => $team->id,
        'work_date' => $week,
        'driver_name' => 'Jane Doe',
        'truck_number' => 'GL0009',
        'gross' => 1000,
        'miles' => 100,
        'source_format' => 'test',
    ]);

    $this->actingAs($user)
        ->get(route('overview'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page->where('teams', function ($teams) {
            $t = collect($teams)->firstWhere('configured_drivers', 1);

            return $t !== null
                && $t['drivers'] === 1
                && $t['avg_per_truck'] === $t['gross']            // gross ÷ 1 truck
                && $t['net_per_truck'] === $t['net']              // net ÷ 1 configured truck
                && $t['margin'] === round($t['net'] / $t['gross'] * 100, 1);
        }));
});

test('the overview honours the actual basis within covered weeks', function () {
    $user = User::factory()->create();
    xlsxTeamFor($user, 1000);
    xlsxTeamFor($user, 500);
    ExpenseActual::create(['source' => 'fuel', 'unit' => 'GL0001', 'week_start' => '2026-07-06', 'amount' => 10]);

    $this->actingAs($user)
        ->get(route('overview', ['start_date' => '2026-07-06', 'end_date' => '2026-07-12', 'basis' => 'actual']))
        ->assertInertia(fn ($page) => $page
            ->where('basis', 'actual')
            ->where('actualAvailable', true));
});

test('the overview falls back to kpi outside covered weeks', function () {
    $user = User::factory()->create();
    xlsxTeamFor($user, 1000);
    xlsxTeamFor($user, 500);

    $this->actingAs($user)
        ->get(route('overview', ['start_date' => '2026-05-04', 'end_date' => '2026-05-10', 'basis' => 'actual']))
        ->assertInertia(fn ($page) => $page
            ->where('basis', 'kpi')
            ->where('actualAvailable', false));
});

test('a single-team user is redirected straight into their team', function () {
    $user = User::factory()->create();
    $team = xlsxTeamFor($user, 1000);

    $this->actingAs($user)
        ->get(route('overview'))
        ->assertRedirect("/{$team->slug}/analytics");
});

test('the overview only rolls up the current user\'s teams', function () {
    $user = User::factory()->create();
    xlsxTeamFor($user, 1000);
    xlsxTeamFor($user, 500);

    // A team the user is NOT a member of must not leak into the roll-up.
    $other = User::factory()->create();
    xlsxTeamFor($other, 9999);

    $this->actingAs($user)
        ->get(route('overview'))
        ->assertInertia(fn ($page) => $page
            ->where('company.teams', 2)
            ->where('company.gross', 1500));
});
