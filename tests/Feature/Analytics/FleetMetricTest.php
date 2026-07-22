<?php

use App\Enums\ExpenseActualSource;
use App\Models\Team;
use App\Models\TeamExpense;
use App\Services\AnalyticsService;

function fleetTeam(): Team
{
    $team = Team::factory()->create();
    TeamExpense::factory()->for($team)->create(['name' => 'Fleet Maintenance', 'actual_source' => ExpenseActualSource::Fleet]);
    TeamExpense::factory()->for($team)->create(['name' => 'Fleet Expenditure', 'actual_source' => null, 'is_manual' => true]);
    TeamExpense::factory()->for($team)->create(['name' => 'Shared Fleet Expenses', 'actual_source' => null]);
    TeamExpense::factory()->for($team)->create(['name' => 'Insurance', 'actual_source' => null]);
    $team->load('expenses');

    return $team;
}

test('actual basis fleet names are exactly the two Actual fleet expenses', function () {
    expect(AnalyticsService::fleetExpenseNames(fleetTeam(), 'actual'))
        ->toEqualCanonicalizing(['Fleet Expenditure', 'Shared Fleet Expenses']);
});

test('kpi basis fleet name is the actual_source=Fleet expense (Fleet Maintenance)', function () {
    expect(AnalyticsService::fleetExpenseNames(fleetTeam(), 'kpi'))
        ->toBe(['Fleet Maintenance']);
});

test('only fleet names present on the team are returned', function () {
    // A team with just the shared flat expense — Fleet Expenditure absent.
    $team = Team::factory()->create();
    TeamExpense::factory()->for($team)->create(['name' => 'Shared Fleet Expenses', 'actual_source' => null]);
    $team->load('expenses');

    expect(AnalyticsService::fleetExpenseNames($team, 'actual'))->toBe(['Shared Fleet Expenses']);
});

test('a team with no fleet expenses returns an empty list in both bases', function () {
    $team = Team::factory()->create();
    TeamExpense::factory()->for($team)->create(['name' => 'Insurance', 'actual_source' => null]);
    $team->load('expenses');

    expect(AnalyticsService::fleetExpenseNames($team, 'actual'))->toBe([])
        ->and(AnalyticsService::fleetExpenseNames($team, 'kpi'))->toBe([]);
});
