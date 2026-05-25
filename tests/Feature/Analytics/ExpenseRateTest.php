<?php

use App\Enums\ExpenseCalculationType;
use App\Models\Team;
use App\Models\TeamExpense;
use Carbon\Carbon;

test('expense rate resolves to the rate in force for a given week', function () {
    $expense = TeamExpense::factory()->for(Team::factory())->create();
    $expense->rates()->delete();
    $expense->rates()->create(['rate' => 0.20, 'effective_from' => '2026-01-05']);
    $expense->rates()->create(['rate' => 0.25, 'effective_from' => '2026-03-02']);
    $expense->load('rates');

    expect($expense->rateAsOf(Carbon::parse('2026-01-05')))->toBe(0.20)
        ->and($expense->rateAsOf(Carbon::parse('2026-02-01')))->toBe(0.20)
        ->and($expense->rateAsOf(Carbon::parse('2026-03-02')))->toBe(0.25)
        ->and($expense->rateAsOf(Carbon::parse('2026-04-15')))->toBe(0.25);
});

test('expense rate falls back to the earliest rate before its history begins', function () {
    $expense = TeamExpense::factory()->for(Team::factory())->create();
    $expense->rates()->delete();
    $expense->rates()->create(['rate' => 0.30, 'effective_from' => '2026-01-05']);
    $expense->load('rates');

    expect($expense->rateAsOf(Carbon::parse('2020-01-01')))->toBe(0.30);
});

test('current rate returns the most recent rate', function () {
    $expense = TeamExpense::factory()->for(Team::factory())->create();
    $expense->rates()->delete();
    $expense->rates()->create(['rate' => 0.20, 'effective_from' => '2026-01-05']);
    $expense->rates()->create(['rate' => 0.25, 'effective_from' => '2026-03-02']);
    $expense->load('rates');

    expect($expense->currentRate())->toBe(0.25);
});

test('calculate applies the calculation type to the given rate', function () {
    $expense = TeamExpense::factory()->for(Team::factory())->create([
        'calculation_type' => ExpenseCalculationType::PerMile,
    ]);

    // 0.20 per mile over 1,000 miles.
    expect($expense->calculate(0.20, 5000.0, 1000.0))->toBe(200.0);
});

test('storing an expense creates an initial rate', function () {
    [$user, $team] = createTeamMember();

    $response = $this
        ->actingAs($user)
        ->post(route('configuration.expenses.store', $team), [
            'name' => 'Fleet Rate',
            'calculation_type' => ExpenseCalculationType::PerMile->value,
            'rate' => 0.20,
            'effective_from' => '2026-05-04',
        ]);

    $response->assertRedirect();

    $expense = TeamExpense::where('team_id', $team->id)->firstOrFail();
    $rate = $expense->rates()->firstOrFail();

    expect($expense->name)->toBe('Fleet Rate')
        ->and($rate->rate)->toBe(0.20)
        ->and($rate->effective_from->toDateString())->toBe('2026-05-04');
});

test('adding a rate creates a new version without mutating prior rates', function () {
    [$user, $team] = createTeamMember();

    $expense = TeamExpense::factory()->for($team)->create();
    $expense->rates()->delete();
    $original = $expense->rates()->create(['rate' => 0.20, 'effective_from' => '2026-01-05']);

    $this
        ->actingAs($user)
        ->post(route('configuration.expenses.rates.store', [$team, $expense]), [
            'rate' => 0.25,
            'effective_from' => '2026-03-02',
        ])
        ->assertRedirect();

    expect($expense->rates()->count())->toBe(2)
        ->and($original->fresh()->rate)->toBe(0.20)
        ->and($original->fresh()->effective_from->toDateString())->toBe('2026-01-05');

    $new = $expense->rates()->where('rate', 0.25)->firstOrFail();
    expect($new->effective_from->toDateString())->toBe('2026-03-02');
});

test('a second rate change in the same week replaces the existing rate', function () {
    [$user, $team] = createTeamMember();

    $expense = TeamExpense::factory()->for($team)->create();
    $expense->rates()->delete();
    $expense->rates()->create(['rate' => 0.20, 'effective_from' => '2026-03-02']);

    $this
        ->actingAs($user)
        ->post(route('configuration.expenses.rates.store', [$team, $expense]), [
            'rate' => 0.22,
            'effective_from' => '2026-03-02',
        ])
        ->assertRedirect();

    expect($expense->rates()->count())->toBe(1)
        ->and($expense->fresh()->currentRate())->toBe(0.22);
});

test('updating an expense definition leaves its rates untouched', function () {
    [$user, $team] = createTeamMember();

    $expense = TeamExpense::factory()->for($team)->create(['name' => 'Old Name']);
    $expense->rates()->delete();
    $expense->rates()->create(['rate' => 0.20, 'effective_from' => '2026-01-05']);

    $this
        ->actingAs($user)
        ->patch(route('configuration.expenses.update', [$team, $expense]), [
            'name' => 'New Name',
            'calculation_type' => $expense->calculation_type->value,
        ])
        ->assertRedirect();

    expect($expense->fresh()->name)->toBe('New Name')
        ->and($expense->rates()->count())->toBe(1)
        ->and($expense->fresh()->currentRate())->toBe(0.20);
});

test('an expense must keep at least one rate', function () {
    [$user, $team] = createTeamMember();

    $expense = TeamExpense::factory()->for($team)->create();
    $expense->rates()->delete();
    $only = $expense->rates()->create(['rate' => 0.20, 'effective_from' => '2026-01-05']);

    $this
        ->actingAs($user)
        ->delete(route('configuration.expenses.rates.destroy', [$team, $expense, $only]))
        ->assertSessionHasErrors('rate');

    expect($expense->rates()->count())->toBe(1);
});

test('a rate can be deleted when others remain', function () {
    [$user, $team] = createTeamMember();

    $expense = TeamExpense::factory()->for($team)->create();
    $expense->rates()->delete();
    $expense->rates()->create(['rate' => 0.20, 'effective_from' => '2026-01-05']);
    $removable = $expense->rates()->create(['rate' => 0.25, 'effective_from' => '2026-03-02']);

    $this
        ->actingAs($user)
        ->delete(route('configuration.expenses.rates.destroy', [$team, $expense, $removable]))
        ->assertRedirect();

    expect($expense->rates()->count())->toBe(1);
    $this->assertDatabaseMissing('team_expense_rates', ['id' => $removable->id]);
});

test('a team cannot manage rates on another teams expense', function () {
    [$user, $team] = createTeamMember();

    $otherExpense = TeamExpense::factory()->for(Team::factory())->create();

    $this
        ->actingAs($user)
        ->post(route('configuration.expenses.rates.store', [$team, $otherExpense]), [
            'rate' => 0.99,
            'effective_from' => '2026-03-02',
        ])
        ->assertForbidden();
});
