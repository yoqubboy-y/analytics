<?php

use App\Enums\DriverContractType;
use App\Enums\ExpenseCalculationType;
use App\Models\DriverConfig;
use App\Models\Team;
use App\Models\TeamExpense;
use App\Services\AnalyticsService;
use Illuminate\Support\Collection;

// Four consecutive Mondays.
const D1 = '2026-06-01';
const D2 = '2026-06-08';
const D3 = '2026-06-15';
const D4 = '2026-06-22';

/**
 * @param  array<int, array{0:string,1:float,2:float,3:string}>  $weeks  [weekStart, gross, miles, dispatcher]
 * @return Collection<int, object>
 */
function dispatcherBuckets(array $weeks): Collection
{
    return collect($weeks)->map(fn (array $w) => (object) [
        'week_start' => $w[0],
        'week_gross' => $w[1],
        'week_miles' => $w[2],
        'dispatcher' => $w[3],
    ]);
}

function cpm(Team $team, float $rate): DriverConfig
{
    $config = DriverConfig::factory()->for($team)->create(['contract_type' => DriverContractType::CompanyCpm]);
    $config->rates()->delete();
    $config->rates()->create(['tariff_rate' => $rate, 'effective_from' => D1]);

    return $config->load('rates');
}

function flatExpense(Team $team, string $name, float $rate): TeamExpense
{
    $expense = TeamExpense::factory()->for($team)->create([
        'calculation_type' => ExpenseCalculationType::Flat,
        'name' => $name,
        'applies_to' => null,
        'skip_when_no_gross' => false,
    ]);
    $expense->rates()->delete();
    $expense->rates()->create(['rate' => $rate, 'effective_from' => D1]);

    return $expense->load('rates');
}

test('a driver who changes dispatcher mid-window splits gross and net per week', function () {
    $team = Team::factory()->create();
    $config = cpm($team, 0.65);
    $flat = flatExpense($team, 'Truck Payment', 350);

    // Weeks 1-3 run by Steve, week 4 by Isaac. Each week: $5,000 / 1,000 mi.
    $buckets = dispatcherBuckets([
        [D1, 5000.0, 1000.0, 'Steve Marshall'],
        [D2, 5000.0, 1000.0, 'Steve Marshall'],
        [D3, 5000.0, 1000.0, 'Steve Marshall'],
        [D4, 5000.0, 1000.0, 'Isaac Foster'],
    ]);
    $activeWeeks = [D1, D2, D3, D4];

    $row = [
        'driver_id' => 42,
        'driver_name' => 'Alexis Bruna',
        'dispatcher' => 'Steve Marshall', // the (wrong) mode value
        'truck_number' => 'GL7000',
        'type' => 'Company CPM',
        'days' => 8,
        'productive_event_days' => 0,
        'total_gross' => 20000.0,
        'total_miles' => 4000.0,
        'rpm' => 5.0,
        'salary' => null,
        'expenses' => [],
        'total_expenses' => null,
        'profit_loss' => null,
        'missing_config' => false,
        'is_total' => false,
    ];

    /** @var array<int, array<string, mixed>> $split */
    $split = app(AnalyticsService::class)->splitConfiguredRow($row, $buckets, $config, collect([$flat]), $activeWeeks);

    expect($split)->toHaveCount(2);

    $byName = collect($split)->keyBy('dispatcher');

    // Whole-driver truth: gross 20,000; salary 4*650=2,600; flat 4*350=1,400; net 16,000.
    // Steve got 3 weeks, Isaac 1 — money follows the weeks, not the mode.
    $steve = $byName['Steve Marshall'];
    $isaac = $byName['Isaac Foster'];

    expect($steve['total_gross'])->toBe(15000.0)
        ->and($steve['salary'])->toBe(1950.0)          // 3 * 1000mi * 0.65
        ->and($steve['profit_loss'])->toBe(12000.0)    // 15000 - 1950 - 1050 flat
        ->and($isaac['total_gross'])->toBe(5000.0)
        ->and($isaac['salary'])->toBe(650.0)
        ->and($isaac['profit_loss'])->toBe(4000.0);    // 5000 - 650 - 350 flat

    // Reconciliation: the parts sum back to the driver's whole-window totals.
    expect($steve['total_gross'] + $isaac['total_gross'])->toBe(20000.0)
        ->and(round($steve['profit_loss'] + $isaac['profit_loss'], 2))->toBe(16000.0);

    // Days (utilization only) split by gross-week share: 3:1 of 8 → 6 and 2.
    expect($steve['days'])->toBe(6)
        ->and($isaac['days'])->toBe(2);
});
