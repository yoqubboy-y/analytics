<?php

use App\Enums\DriverAssignmentKind;
use App\Enums\DriverContractType;
use App\Enums\TeamDataSource;
use App\Models\DriverConfig;
use App\Models\Team;
use App\Models\User;
use App\Models\XlsxDriverDay;
use App\Services\AnalyticsService;
use Carbon\CarbonImmutable;

function assignTruck(DriverConfig $config, string $value, string $from, ?string $to = null): void
{
    $config->assignments()->create([
        'kind' => DriverAssignmentKind::Truck,
        'value' => $value,
        'effective_from' => $from,
        'effective_to' => $to,
    ]);
}

test('assignmentAsOf resolves the value in force, most recent effective_from winning', function () {
    $config = DriverConfig::factory()->create();
    assignTruck($config, 'GL7005', '2026-07-06');
    assignTruck($config, 'GL9999', '2026-07-20');
    $config->load('assignments');

    $at = fn (string $d) => $config->assignmentAsOf(DriverAssignmentKind::Truck, CarbonImmutable::parse($d));

    expect($at('2026-07-10'))->toBe('GL7005')   // inside first, open-ended
        ->and($at('2026-07-20'))->toBe('GL9999') // exactly the new start
        ->and($at('2026-07-25'))->toBe('GL9999') // after the swap
        ->and($at('2026-07-05'))->toBe('GL7005'); // before the first → earliest
});

test('a bounded assignment with no successor resolves to null past its end', function () {
    $config = DriverConfig::factory()->create();
    assignTruck($config, 'GL7005', '2026-07-06', '2026-07-12');
    $config->load('assignments');

    $at = fn (string $d) => $config->assignmentAsOf(DriverAssignmentKind::Truck, CarbonImmutable::parse($d));

    expect($at('2026-07-12'))->toBe('GL7005') // effective_to is inclusive
        ->and($at('2026-07-13'))->toBeNull();
});

test('kinds resolve independently of one another', function () {
    $config = DriverConfig::factory()->create();
    assignTruck($config, 'GL7005', '2026-07-06');
    $config->assignments()->create([
        'kind' => DriverAssignmentKind::Trailer,
        'value' => 'T6330',
        'effective_from' => '2026-07-06',
        'effective_to' => null,
    ]);
    $config->load('assignments');

    $date = CarbonImmutable::parse('2026-07-10');

    expect($config->assignmentAsOf(DriverAssignmentKind::Truck, $date))->toBe('GL7005')
        ->and($config->assignmentAsOf(DriverAssignmentKind::Trailer, $date))->toBe('T6330')
        ->and($config->assignmentAsOf(DriverAssignmentKind::Dispatcher, $date))->toBeNull();
});

test('an assignment can be added, replaced on the same start date, and deleted', function () {
    $team = Team::factory()->create();
    $config = DriverConfig::factory()->for($team)->create();
    $user = User::factory()->create();
    $team->members()->attach($user, ['role' => 'owner']);

    $post = fn (array $data) => $this->actingAs($user)->from("/{$team->slug}/configuration")
        ->post("/{$team->slug}/configuration/driver-configs/{$config->id}/assignments", $data);

    $post(['kind' => 'truck', 'value' => 'GL7005', 'effective_from' => '2026-07-06'])
        ->assertRedirect();
    expect($config->assignments()->where('kind', 'truck')->count())->toBe(1);

    // Same kind + start date replaces rather than duplicates.
    $post(['kind' => 'truck', 'value' => 'GL9999', 'effective_from' => '2026-07-06'])
        ->assertRedirect();
    expect($config->assignments()->where('kind', 'truck')->count())->toBe(1)
        ->and($config->assignments()->where('kind', 'truck')->first()->value)->toBe('GL9999');

    $assignment = $config->assignments()->first();
    $this->actingAs($user)->from("/{$team->slug}/configuration")
        ->delete("/{$team->slug}/configuration/driver-configs/{$config->id}/assignments/{$assignment->id}")
        ->assertRedirect();
    expect($config->assignments()->count())->toBe(0);
});

test('the xlsx board shows the truck assignment when imported day-rows have no unit', function () {
    $team = Team::factory()->create(['data_source' => TeamDataSource::Xlsx]);
    // Name-only key (empty truck) — this is how configs attach to truck-less day-rows.
    $config = DriverConfig::factory()->for($team)->create([
        'contract_type' => DriverContractType::CompanyCpm,
        'external_driver_key' => 'test driver|',
    ]);
    $config->rates()->create(['tariff_rate' => 0.65, 'effective_from' => '2026-07-06']);
    assignTruck($config, 'GL2555', '2026-07-06');

    // The imported sheet omitted the unit, so the day-row's truck is blank.
    XlsxDriverDay::create([
        'team_id' => $team->id,
        'work_date' => '2026-07-06',
        'driver_name' => 'Test Driver',
        'truck_number' => '',
        'gross' => 5000,
        'miles' => 1000,
        'source_format' => 'test',
    ]);

    $rows = app(AnalyticsService::class)->weeklyReport(
        $team,
        CarbonImmutable::parse('2026-07-06'),
        CarbonImmutable::parse('2026-07-12'),
        'kpi',
    );
    $row = $rows->firstWhere('driver_name', 'Test Driver');

    expect($row)->not->toBeNull()
        ->and($row['missing_config'])->toBeFalse()
        ->and($row['truck_number'])->toBe('GL2555'); // filled from the assignment, not the blank day-row
});
