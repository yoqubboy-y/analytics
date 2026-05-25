<?php

use App\Enums\DriverContractType;
use App\Enums\ExpenseCalculationType;
use App\Models\DriverConfig;
use App\Models\Team;
use App\Models\TeamExpense;
use App\Services\AnalyticsService;
use Carbon\Carbon;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

// Four consecutive Mondays used as the report window throughout.
const W1 = '2026-03-02';
const W2 = '2026-03-09';
const W3 = '2026-03-16';
const W4 = '2026-03-23';

/** @return array<int, CarbonImmutable> */
function windowWeeks(): array
{
    return array_map(fn (string $d) => CarbonImmutable::parse($d), [W1, W2, W3, W4]);
}

/** @return Collection<int, object> */
function weekBuckets(array $weeks): Collection
{
    return collect($weeks)->map(fn (array $w) => (object) [
        'week_start' => $w[0],
        'week_gross' => $w[1],
        'week_miles' => $w[2],
    ]);
}

function cpmConfig(Team $team, array $rates): DriverConfig
{
    $config = DriverConfig::factory()->for($team)->create(['contract_type' => DriverContractType::CompanyCpm]);
    $config->rates()->delete();
    foreach ($rates as $r) {
        $config->rates()->create($r);
    }

    return $config->load('rates');
}

function expenseWithRates(Team $team, ExpenseCalculationType $type, string $name, array $rates, bool $skip = false): TeamExpense
{
    $expense = TeamExpense::factory()->for($team)->create([
        'calculation_type' => $type,
        'name' => $name,
        'applies_to' => null,
        'skip_when_no_gross' => $skip,
    ]);
    $expense->rates()->delete();
    foreach ($rates as $r) {
        $expense->rates()->create($r);
    }

    return $expense->load('rates');
}

test('flat expenses accrue once per week, so they scale across the window', function () {
    $team = Team::factory()->create();
    $config = cpmConfig($team, [['tariff_rate' => 0.65, 'effective_from' => W1]]);
    $flat = expenseWithRates($team, ExpenseCalculationType::Flat, 'Truck Payment', [['rate' => 350, 'effective_from' => W1]]);

    $buckets = weekBuckets([
        [W1, 5000.0, 1000.0],
        [W2, 5000.0, 1000.0],
        [W3, 5000.0, 1000.0],
        [W4, 5000.0, 1000.0],
    ]);

    $result = app(AnalyticsService::class)->computeFinancials($config, collect([$flat]), $buckets, windowWeeks());

    // $350/week over 4 weeks, not a single $350.
    expect($result['expenses']['Truck Payment'])->toBe(1400.0)
        ->and($result['total_expenses'])->toBe(1400.0)
        ->and($result['salary'])->toBe(2600.0); // 1000 mi * 0.65 * 4
});

test('flat expenses with skip_when_no_gross only charge weeks the driver ran', function () {
    $team = Team::factory()->create();
    $config = cpmConfig($team, [['tariff_rate' => 0.65, 'effective_from' => W1]]);
    $flat = expenseWithRates($team, ExpenseCalculationType::Flat, 'Insurance', [['rate' => 350, 'effective_from' => W1]], skip: true);

    // Only two of the four weeks have gross.
    $buckets = weekBuckets([
        [W1, 5000.0, 1000.0],
        [W2, 5000.0, 1000.0],
    ]);

    $result = app(AnalyticsService::class)->computeFinancials($config, collect([$flat]), $buckets, windowWeeks());

    expect($result['expenses']['Insurance'])->toBe(700.0); // 2 active weeks
});

test('per-mile expenses scale with each week and total over the window', function () {
    $team = Team::factory()->create();
    $config = cpmConfig($team, [['tariff_rate' => 0.65, 'effective_from' => W1]]);
    $fuel = expenseWithRates($team, ExpenseCalculationType::PerMile, 'Fuel', [['rate' => 0.20, 'effective_from' => W1]]);

    $buckets = weekBuckets([
        [W1, 5000.0, 1000.0],
        [W2, 5000.0, 1000.0],
        [W3, 5000.0, 1000.0],
        [W4, 5000.0, 1000.0],
    ]);

    $result = app(AnalyticsService::class)->computeFinancials($config, collect([$fuel]), $buckets, windowWeeks());

    expect($result['expenses']['Fuel'])->toBe(800.0); // 4000 mi * 0.20
});

test('salary uses each week own tariff when the rate changes mid-window', function () {
    $team = Team::factory()->create();
    // 0.60 for weeks 1-2, 0.80 from week 3 on.
    $config = cpmConfig($team, [
        ['tariff_rate' => 0.60, 'effective_from' => W1, 'effective_to' => W2],
        ['tariff_rate' => 0.80, 'effective_from' => W3],
    ]);

    $buckets = weekBuckets([
        [W1, 5000.0, 1000.0],
        [W2, 5000.0, 1000.0],
        [W3, 5000.0, 1000.0],
        [W4, 5000.0, 1000.0],
    ]);

    $result = app(AnalyticsService::class)->computeFinancials($config, collect([]), $buckets, windowWeeks());

    // (1000*0.60)*2 + (1000*0.80)*2
    expect($result['salary'])->toBe(2800.0);
});

test('a bounded expense rate stops charging after its end with no successor', function () {
    $team = Team::factory()->create();
    $config = cpmConfig($team, [['tariff_rate' => 0.65, 'effective_from' => W1]]);
    // Flat only in force for weeks 1-2.
    $flat = expenseWithRates($team, ExpenseCalculationType::Flat, 'Trailer Rent', [
        ['rate' => 350, 'effective_from' => W1, 'effective_to' => W2],
    ]);

    $buckets = weekBuckets([
        [W1, 5000.0, 1000.0],
        [W2, 5000.0, 1000.0],
        [W3, 5000.0, 1000.0],
        [W4, 5000.0, 1000.0],
    ]);

    $result = app(AnalyticsService::class)->computeFinancials($config, collect([$flat]), $buckets, windowWeeks());

    expect($result['expenses']['Trailer Rent'])->toBe(700.0); // only weeks 1-2
});

test('rateAsOf honours a bounded effective window', function () {
    $team = Team::factory()->create();
    $expense = expenseWithRates($team, ExpenseCalculationType::Flat, 'Bounded', [
        ['rate' => 100, 'effective_from' => W1, 'effective_to' => W2],
    ]);

    expect($expense->rateAsOf(Carbon::parse(W1)))->toBe(100.0)
        ->and($expense->rateAsOf(Carbon::parse(W2)))->toBe(100.0)
        ->and($expense->rateAsOf(Carbon::parse(W3)))->toBeNull() // past the end, no successor
        ->and($expense->rateAsOf(Carbon::parse('2020-01-01')))->toBe(100.0); // before history: earliest
});
