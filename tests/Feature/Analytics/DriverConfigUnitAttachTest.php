<?php

use App\Enums\DriverAssignmentKind;
use App\Enums\DriverContractType;
use App\Models\DriverConfig;
use Carbon\CarbonImmutable;

test('storing a driver config attaches truck and trailer as open-ended assignments', function () {
    [$user, $team] = createTeamMember();

    $this
        ->actingAs($user)
        ->post(route('configuration.driver-configs.store', $team), [
            'external_driver_id' => 42,
            'contract_type' => DriverContractType::CompanyCpm->value,
            'tariff_rate' => 0.65,
            'effective_from' => '2026-05-04',
            'truck' => ' GL7005 ',
            'trailer' => 'T6330',
        ])
        ->assertRedirect();

    $config = DriverConfig::where('team_id', $team->id)->firstOrFail();
    $config->load('assignments');

    $week = CarbonImmutable::parse('2026-05-04');

    expect($config->assignments)->toHaveCount(2)
        // stored value is trimmed
        ->and($config->assignmentAsOf(DriverAssignmentKind::Truck, $week))->toBe('GL7005')
        ->and($config->assignmentAsOf(DriverAssignmentKind::Trailer, $week))->toBe('T6330')
        // open-ended: still in force well past the start week
        ->and($config->assignmentAsOf(DriverAssignmentKind::Truck, $week->addWeeks(20)))->toBe('GL7005');

    $truck = $config->assignments->firstWhere('kind', DriverAssignmentKind::Truck);
    expect($truck->effective_from->toDateString())->toBe('2026-05-04')
        ->and($truck->effective_to)->toBeNull();
});

test('storing a driver config without units attaches no assignments', function () {
    [$user, $team] = createTeamMember();

    $this
        ->actingAs($user)
        ->post(route('configuration.driver-configs.store', $team), [
            'external_driver_id' => 7,
            'contract_type' => DriverContractType::CompanyCpm->value,
            'tariff_rate' => 0.60,
            'effective_from' => '2026-05-04',
        ])
        ->assertRedirect();

    $config = DriverConfig::where('team_id', $team->id)->firstOrFail();

    expect($config->assignments()->count())->toBe(0);
});

test('blank unit strings do not create empty assignments', function () {
    [$user, $team] = createTeamMember();

    $this
        ->actingAs($user)
        ->post(route('configuration.driver-configs.store', $team), [
            'external_driver_id' => 9,
            'contract_type' => DriverContractType::CompanyCpm->value,
            'tariff_rate' => 0.60,
            'effective_from' => '2026-05-04',
            'truck' => '   ',
            'trailer' => '',
        ])
        ->assertRedirect();

    $config = DriverConfig::where('team_id', $team->id)->firstOrFail();

    expect($config->assignments()->count())->toBe(0);
});
