<?php

use App\Enums\TeamDataSource;
use App\Enums\TeamRole;
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
            ->has('teams', 2));
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
