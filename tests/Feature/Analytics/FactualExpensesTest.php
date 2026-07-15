<?php

use App\Enums\DriverAssignmentKind;
use App\Enums\DriverContractType;
use App\Enums\ExpenseActualSource;
use App\Enums\ExpenseCalculationType;
use App\Models\DriverConfig;
use App\Models\EquipmentPayment;
use App\Models\ExpenseActual;
use App\Models\Team;
use App\Models\TeamExpense;
use App\Services\AnalyticsService;
use App\Services\ExpenseActualsLookup;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

const WK = '2026-07-06'; // a covered ISO-week Monday

/** @return Collection<int, object> */
function buckets(float $gross = 5000, float $miles = 1000): Collection
{
    return collect([(object) ['week_start' => WK, 'week_gross' => $gross, 'week_miles' => $miles]]);
}

// ---- ExpenseActualsLookup ----

test('truck payment converts monthly to a weekly slice', function () {
    EquipmentPayment::create(['kind' => 'truck', 'unit' => 'GL7005', 'monthly_amount' => 3322.70, 'effective_from' => '2000-01-01']);
    $lookup = ExpenseActualsLookup::forWindow(CarbonImmutable::parse(WK), CarbonImmutable::parse(WK));

    expect($lookup->amountFor(ExpenseActualSource::TruckPayment, 'GL7005', null, CarbonImmutable::parse(WK)))
        ->toBe(round(3322.70 * 12 / 52, 2)); // 766.78
});

test('fuel sums the ledger for the unit+week; a missing unit is null', function () {
    ExpenseActual::create(['source' => 'fuel', 'unit' => 'GL7005', 'week_start' => WK, 'amount' => 100]);
    ExpenseActual::create(['source' => 'fuel', 'unit' => 'GL7005', 'week_start' => WK, 'amount' => 50]);
    $lookup = ExpenseActualsLookup::forWindow(CarbonImmutable::parse(WK), CarbonImmutable::parse(WK));
    $week = CarbonImmutable::parse(WK);

    expect($lookup->amountFor(ExpenseActualSource::Fuel, 'GL7005', null, $week))->toBe(150.0)
        ->and($lookup->amountFor(ExpenseActualSource::Fuel, 'NOPE', null, $week))->toBeNull();
});

test('fleet maintenance sums truck and trailer repairs', function () {
    ExpenseActual::create(['source' => 'fleet', 'unit' => 'GL7005', 'week_start' => WK, 'amount' => 200]);
    ExpenseActual::create(['source' => 'fleet', 'unit' => 'T6330', 'week_start' => WK, 'amount' => 80]);
    $lookup = ExpenseActualsLookup::forWindow(CarbonImmutable::parse(WK), CarbonImmutable::parse(WK));

    expect($lookup->amountFor(ExpenseActualSource::Fleet, 'GL7005', 'T6330', CarbonImmutable::parse(WK)))->toBe(280.0);
});

test('coveredWeeks reports the loaded ledger bounds', function () {
    expect(ExpenseActualsLookup::coveredWeeks())->toBeNull();

    ExpenseActual::create(['source' => 'fuel', 'unit' => 'GL7005', 'week_start' => '2026-06-29', 'amount' => 10]);
    ExpenseActual::create(['source' => 'fuel', 'unit' => 'GL7005', 'week_start' => WK, 'amount' => 10]);

    expect(ExpenseActualsLookup::coveredWeeks())->toBe(['2026-06-29', WK]);
});

// ---- computeFinancials swap ----

/** A CPM driver on GL7005 with a flat "Truck Payment" configured at $1,000/wk. */
function truckExpenseFixture(): array
{
    $team = Team::factory()->create();
    $config = DriverConfig::factory()->for($team)->create(['contract_type' => DriverContractType::CompanyCpm]);
    $config->rates()->create(['tariff_rate' => 0.65, 'effective_from' => WK]);
    $config->assignments()->create(['kind' => DriverAssignmentKind::Truck, 'value' => 'GL7005', 'effective_from' => WK]);
    $config->load('rates', 'assignments');

    $expense = TeamExpense::factory()->for($team)->create([
        'name' => 'Truck Payment',
        'calculation_type' => ExpenseCalculationType::Flat,
        'actual_source' => ExpenseActualSource::TruckPayment,
        'applies_to' => null,
    ]);
    $expense->rates()->create(['rate' => 1000, 'effective_from' => WK]);

    return [$config, collect([$expense->load('rates')])];
}

test('kpi basis uses the configured rate; actual basis uses the real payment', function () {
    [$config, $expenses] = truckExpenseFixture();
    EquipmentPayment::create(['kind' => 'truck', 'unit' => 'GL7005', 'monthly_amount' => 3322.70, 'effective_from' => '2000-01-01']);

    $svc = app(AnalyticsService::class);
    $windowWeeks = [CarbonImmutable::parse(WK)];
    $lookup = ExpenseActualsLookup::forWindow(CarbonImmutable::parse(WK), CarbonImmutable::parse(WK));

    $kpi = $svc->computeFinancials($config, $expenses, buckets(), $windowWeeks, [WK], 'kpi');
    $actual = $svc->computeFinancials($config, $expenses, buckets(), $windowWeeks, [WK], 'actual', 'GL7005', $lookup);

    expect($kpi['expenses']['Truck Payment'])->toBe(1000.0)
        ->and($actual['expenses']['Truck Payment'])->toBe(round(3322.70 * 12 / 52, 2)) // 766.78
        ->and($actual['salary'])->toBe($kpi['salary']); // salary is basis-agnostic
});

test('actual basis with no data for the unit/week charges $0', function () {
    [$config, $expenses] = truckExpenseFixture(); // no EquipmentPayment seeded
    $svc = app(AnalyticsService::class);
    $lookup = ExpenseActualsLookup::forWindow(CarbonImmutable::parse(WK), CarbonImmutable::parse(WK));

    $actual = $svc->computeFinancials($config, $expenses, buckets(), [CarbonImmutable::parse(WK)], [WK], 'actual', 'GL7005', $lookup);

    expect($actual['expenses']['Truck Payment'])->toBe(0.0);
});

test('a non-sourced expense is identical across bases', function () {
    $team = Team::factory()->create();
    $config = DriverConfig::factory()->for($team)->create(['contract_type' => DriverContractType::CompanyCpm]);
    $config->rates()->create(['tariff_rate' => 0.65, 'effective_from' => WK]);
    $config->load('rates', 'assignments');

    // Factoring: a % of gross with NO actual_source — must not change.
    $factoring = TeamExpense::factory()->for($team)->create([
        'name' => 'Factoring Fee',
        'calculation_type' => ExpenseCalculationType::PercentageOfGross,
        'actual_source' => null,
        'applies_to' => null,
    ]);
    $factoring->rates()->create(['rate' => 0.01, 'effective_from' => WK]);
    $expenses = collect([$factoring->load('rates')]);

    $svc = app(AnalyticsService::class);
    $windowWeeks = [CarbonImmutable::parse(WK)];
    $lookup = ExpenseActualsLookup::forWindow(CarbonImmutable::parse(WK), CarbonImmutable::parse(WK));

    $kpi = $svc->computeFinancials($config, $expenses, buckets(gross: 5000), $windowWeeks, [WK], 'kpi');
    $actual = $svc->computeFinancials($config, $expenses, buckets(gross: 5000), $windowWeeks, [WK], 'actual', 'GL7005', $lookup);

    expect($actual['expenses']['Factoring Fee'])->toBe(50.0)   // 5000 * 0.01
        ->and($actual['expenses'])->toEqual($kpi['expenses']);
});
