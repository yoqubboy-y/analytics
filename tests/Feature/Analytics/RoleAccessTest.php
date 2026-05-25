<?php

use App\Enums\ExpenseCalculationType;
use App\Enums\TeamRole;

$validExpense = [
    'name' => 'Fuel',
    'calculation_type' => 'per_mile',
    'rate' => 0.20,
    'effective_from' => '2026-05-04',
];

test('viewers cannot reach configuration editing', function () use ($validExpense) {
    [$user, $team] = createTeamMember(TeamRole::Viewer);

    $this
        ->actingAs($user)
        ->post(route('configuration.expenses.store', $team), [
            ...$validExpense,
            'calculation_type' => ExpenseCalculationType::PerMile->value,
        ])
        ->assertForbidden();

    expect($team->expenses()->count())->toBe(0);
});

test('members can reach configuration editing', function () use ($validExpense) {
    [$user, $team] = createTeamMember(TeamRole::Member);

    $this
        ->actingAs($user)
        ->post(route('configuration.expenses.store', $team), [
            ...$validExpense,
            'calculation_type' => ExpenseCalculationType::PerMile->value,
        ])
        ->assertRedirect();

    $this->assertDatabaseHas('team_expenses', [
        'team_id' => $team->id,
        'name' => 'Fuel',
    ]);
});

test('admins can reach configuration editing', function () use ($validExpense) {
    [$user, $team] = createTeamMember(TeamRole::Admin);

    $this
        ->actingAs($user)
        ->post(route('configuration.expenses.store', $team), [
            ...$validExpense,
            'calculation_type' => ExpenseCalculationType::PerMile->value,
        ])
        ->assertRedirect();

    $this->assertDatabaseHas('team_expenses', [
        'team_id' => $team->id,
        'name' => 'Fuel',
    ]);
});
