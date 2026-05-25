<?php

use App\Enums\DriverContractType;
use App\Models\DriverConfig;
use App\Models\Team;
use Carbon\Carbon;

test('tariff rate resolves to the rate in force for a given week', function () {
    $config = DriverConfig::factory()->for(Team::factory())->create();
    $config->rates()->delete();
    $config->rates()->create(['tariff_rate' => 0.60, 'effective_from' => '2026-01-05']);
    $config->rates()->create(['tariff_rate' => 0.70, 'effective_from' => '2026-03-02']);
    $config->load('rates');

    expect($config->tariffRateAsOf(Carbon::parse('2026-01-05')))->toBe(0.60)
        ->and($config->tariffRateAsOf(Carbon::parse('2026-02-01')))->toBe(0.60)
        ->and($config->tariffRateAsOf(Carbon::parse('2026-03-02')))->toBe(0.70)
        ->and($config->tariffRateAsOf(Carbon::parse('2026-04-15')))->toBe(0.70);
});

test('tariff rate falls back to the earliest rate before its history begins', function () {
    $config = DriverConfig::factory()->for(Team::factory())->create();
    $config->rates()->delete();
    $config->rates()->create(['tariff_rate' => 0.65, 'effective_from' => '2026-01-05']);
    $config->load('rates');

    expect($config->tariffRateAsOf(Carbon::parse('2020-01-01')))->toBe(0.65);
});

test('salary for a CPM driver uses miles times the resolved tariff', function () {
    $config = DriverConfig::factory()->for(Team::factory())->create([
        'contract_type' => DriverContractType::CompanyCpm,
    ]);

    expect($config->calculateSalary(0.65, 5000.0, 1000.0, false))->toBe(650.0);
});

test('salary for a percentage driver uses gross times the resolved tariff', function () {
    $config = DriverConfig::factory()->for(Team::factory())->create([
        'contract_type' => DriverContractType::CompanyPercentage,
    ]);

    expect($config->calculateSalary(0.30, 5000.0, 1000.0, false))->toBe(1500.0);
});

test('storing a driver config creates an initial tariff rate', function () {
    [$user, $team] = createTeamMember();

    $this
        ->actingAs($user)
        ->post(route('configuration.driver-configs.store', $team), [
            'external_driver_id' => 42,
            'contract_type' => DriverContractType::CompanyCpm->value,
            'tariff_rate' => 0.65,
            'effective_from' => '2026-05-04',
        ])
        ->assertRedirect();

    $config = DriverConfig::where('team_id', $team->id)->firstOrFail();
    $rate = $config->rates()->firstOrFail();

    expect($config->external_driver_id)->toBe(42)
        ->and($rate->tariff_rate)->toBe(0.65)
        ->and($rate->effective_from->toDateString())->toBe('2026-05-04');
});

test('adding a tariff rate creates a new version without mutating prior rates', function () {
    [$user, $team] = createTeamMember();

    $config = DriverConfig::factory()->for($team)->create();
    $config->rates()->delete();
    $original = $config->rates()->create(['tariff_rate' => 0.60, 'effective_from' => '2026-01-05']);

    $this
        ->actingAs($user)
        ->post(route('configuration.driver-configs.rates.store', [$team, $config]), [
            'tariff_rate' => 0.70,
            'effective_from' => '2026-03-02',
        ])
        ->assertRedirect();

    expect($config->rates()->count())->toBe(2)
        ->and($original->fresh()->tariff_rate)->toBe(0.60)
        ->and($original->fresh()->effective_from->toDateString())->toBe('2026-01-05');
});

test('updating a driver config contract type leaves its rates untouched', function () {
    [$user, $team] = createTeamMember();

    $config = DriverConfig::factory()->for($team)->create([
        'contract_type' => DriverContractType::CompanyCpm,
    ]);
    $config->rates()->delete();
    $config->rates()->create(['tariff_rate' => 0.65, 'effective_from' => '2026-01-05']);

    $this
        ->actingAs($user)
        ->patch(route('configuration.driver-configs.update', [$team, $config]), [
            'contract_type' => DriverContractType::CompanyPercentage->value,
        ])
        ->assertRedirect();

    expect($config->fresh()->contract_type)->toBe(DriverContractType::CompanyPercentage)
        ->and($config->rates()->count())->toBe(1)
        ->and($config->fresh()->currentRate())->toBe(0.65);
});

test('a driver config must keep at least one rate', function () {
    [$user, $team] = createTeamMember();

    $config = DriverConfig::factory()->for($team)->create();
    $config->rates()->delete();
    $only = $config->rates()->create(['tariff_rate' => 0.65, 'effective_from' => '2026-01-05']);

    $this
        ->actingAs($user)
        ->delete(route('configuration.driver-configs.rates.destroy', [$team, $config, $only]))
        ->assertSessionHasErrors('rate');

    expect($config->rates()->count())->toBe(1);
});

test('a team cannot manage rates on another teams driver config', function () {
    [$user, $team] = createTeamMember();

    $otherConfig = DriverConfig::factory()->for(Team::factory())->create();

    $this
        ->actingAs($user)
        ->post(route('configuration.driver-configs.rates.store', [$team, $otherConfig]), [
            'tariff_rate' => 0.99,
            'effective_from' => '2026-03-02',
        ])
        ->assertForbidden();
});
