<?php

use App\Enums\DriverAssignmentKind;
use App\Enums\DriverContractType;
use App\Enums\ExpenseActualSource;
use App\Enums\ExpenseCalculationType;
use App\Enums\TeamDataSource;
use App\Enums\TeamRole;
use App\Models\DriverConfig;
use App\Models\ExpenseActual;
use App\Models\ExpenseAttribution;
use App\Models\Team;
use App\Models\TeamExpense;
use App\Models\XlsxDriverDay;
use App\Services\AnalyticsService;
use App\Services\ExpenseActualsLookup;
use App\Services\ManualAttributionLookup;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

const MWK = '2026-07-13'; // an ISO-week Monday

/** @return Collection<int, object> */
function mBuckets(string $week = MWK, float $gross = 5000, float $miles = 1000): Collection
{
    return collect([(object) ['week_start' => $week, 'week_gross' => $gross, 'week_miles' => $miles]]);
}

/**
 * A manual "Fleet Maintenance" expense on a CompanyCpm driver, plus the tools
 * to compute it. Returns [config, expenses collection, expense].
 */
function manualFixture(?array $appliesTo = null): array
{
    $team = Team::factory()->create();
    $config = DriverConfig::factory()->for($team)->create(['contract_type' => DriverContractType::CompanyCpm]);
    $config->rates()->create(['tariff_rate' => 0.65, 'effective_from' => MWK]);
    $config->load('rates', 'assignments');

    $expense = TeamExpense::factory()->for($team)->create([
        'name' => 'Fleet Maintenance',
        'calculation_type' => ExpenseCalculationType::PerMile,
        'actual_source' => null,
        'is_manual' => true,
        'applies_to' => $appliesTo,
        'applies_to_kpi' => false,
    ]);
    $expense->rates()->create(['rate' => 0.20, 'effective_from' => MWK]);

    return [$config, collect([$expense->load('rates')]), $expense];
}

function manualActual(DriverConfig $config, Collection $expenses, TeamExpense $expense, Collection $buckets, string $week = MWK): array
{
    $lookup = ManualAttributionLookup::forWindow([$expense->id], CarbonImmutable::parse($week), CarbonImmutable::parse($week));

    return app(AnalyticsService::class)->computeFinancials(
        $config, $expenses, $buckets, [CarbonImmutable::parse($week)], [$week], 'actual', null, null, $lookup
    );
}

// ---- ManualAttributionLookup ----

test('the lookup splits company and driver sums per expense/config/week', function () {
    [$config, , $expense] = manualFixture();

    ExpenseAttribution::create(['team_expense_id' => $expense->id, 'driver_config_id' => $config->id, 'week_start' => MWK, 'amount' => 1000, 'paid_by' => 'company']);
    ExpenseAttribution::create(['team_expense_id' => $expense->id, 'driver_config_id' => $config->id, 'week_start' => MWK, 'amount' => 500, 'paid_by' => 'company']);
    ExpenseAttribution::create(['team_expense_id' => $expense->id, 'driver_config_id' => $config->id, 'week_start' => MWK, 'amount' => 200, 'paid_by' => 'driver']);

    $lookup = ManualAttributionLookup::forWindow([$expense->id], CarbonImmutable::parse(MWK), CarbonImmutable::parse(MWK));
    $sums = $lookup->amountFor($expense->id, $config->id, CarbonImmutable::parse(MWK));

    expect($sums)->toBe(['company' => 1500.0, 'driver' => 200.0])
        ->and($lookup->amountFor($expense->id, $config->id, CarbonImmutable::parse('2026-07-20')))->toBeNull();
});

// ---- computeFinancials manual branch ----

test('company-paid attribution is a positive cost counted in total_expenses', function () {
    [$config, $expenses, $expense] = manualFixture();
    ExpenseAttribution::create(['team_expense_id' => $expense->id, 'driver_config_id' => $config->id, 'week_start' => MWK, 'amount' => 2163.61, 'paid_by' => 'company']);

    $actual = manualActual($config, $expenses, $expense, mBuckets());

    expect($actual['expenses']['Fleet Maintenance'])->toBe(2163.61)
        ->and($actual['total_expenses'])->toBe(2163.61);
});

test('driver-paid attribution renders negative and stays out of total_expenses', function () {
    [$config, $expenses, $expense] = manualFixture();
    ExpenseAttribution::create(['team_expense_id' => $expense->id, 'driver_config_id' => $config->id, 'week_start' => MWK, 'amount' => 800, 'paid_by' => 'driver']);

    $actual = manualActual($config, $expenses, $expense, mBuckets());

    expect($actual['expenses']['Fleet Maintenance'])->toBe(-800.0)
        ->and($actual['total_expenses'])->toBe(0.0);
});

test('a driver with no attribution gets no manual cell and $0 cost', function () {
    [$config, $expenses, $expense] = manualFixture();
    // No attribution seeded for this driver/week.

    $actual = manualActual($config, $expenses, $expense, mBuckets());

    expect($actual['expenses'])->not->toHaveKey('Fleet Maintenance')
        ->and($actual['total_expenses'])->toBe(0.0);
});

test('manual attributions sum across the weeks in the window', function () {
    [$config, $expenses, $expense] = manualFixture();
    ExpenseAttribution::create(['team_expense_id' => $expense->id, 'driver_config_id' => $config->id, 'week_start' => '2026-07-06', 'amount' => 1000, 'paid_by' => 'company']);
    ExpenseAttribution::create(['team_expense_id' => $expense->id, 'driver_config_id' => $config->id, 'week_start' => '2026-07-13', 'amount' => 1500, 'paid_by' => 'company']);

    $lookup = ManualAttributionLookup::forWindow([$expense->id], CarbonImmutable::parse('2026-07-06'), CarbonImmutable::parse('2026-07-13'));
    $windowWeeks = [CarbonImmutable::parse('2026-07-06'), CarbonImmutable::parse('2026-07-13')];
    $buckets = collect([
        (object) ['week_start' => '2026-07-06', 'week_gross' => 5000, 'week_miles' => 1000],
        (object) ['week_start' => '2026-07-13', 'week_gross' => 5000, 'week_miles' => 1000],
    ]);

    $actual = app(AnalyticsService::class)->computeFinancials(
        $config, $expenses, $buckets, $windowWeeks, ['2026-07-06', '2026-07-13'], 'actual', null, null, $lookup
    );

    expect($actual['expenses']['Fleet Maintenance'])->toBe(2500.0);
});

test('manual ignores the contract-type gate — an attribution always lands', function () {
    // applies_to excludes CompanyCpm, but the attribution is explicit → it shows.
    [$config, $expenses, $expense] = manualFixture(appliesTo: ['lease_operator']);
    ExpenseAttribution::create(['team_expense_id' => $expense->id, 'driver_config_id' => $config->id, 'week_start' => MWK, 'amount' => 999, 'paid_by' => 'company']);

    $actual = manualActual($config, $expenses, $expense, mBuckets());

    expect($actual['expenses']['Fleet Maintenance'])->toBe(999.0);
});

test('manual lands even in a zero-gross week', function () {
    [$config, $expenses, $expense] = manualFixture();
    ExpenseAttribution::create(['team_expense_id' => $expense->id, 'driver_config_id' => $config->id, 'week_start' => MWK, 'amount' => 750, 'paid_by' => 'company']);

    $actual = manualActual($config, $expenses, $expense, mBuckets(gross: 0, miles: 0));

    expect($actual['expenses']['Fleet Maintenance'])->toBe(750.0);
});

test('KPI basis ignores manual attributions (uses the configured rate)', function () {
    [$config, $expenses, $expense] = manualFixture();
    $expense->update(['applies_to_kpi' => true]);
    ExpenseAttribution::create(['team_expense_id' => $expense->id, 'driver_config_id' => $config->id, 'week_start' => MWK, 'amount' => 9999, 'paid_by' => 'company']);

    // No lookup passed → KPI path. 0.20/mile * 1000 miles = 200.
    $kpi = app(AnalyticsService::class)->computeFinancials(
        $config, $expenses, mBuckets(), [CarbonImmutable::parse(MWK)], [MWK], 'kpi'
    );

    expect($kpi['expenses']['Fleet Maintenance'])->toBe(200.0);
});

// ---- coverage gate ----

test('coveredWeeks unions manual attribution weeks with the ledger', function () {
    expect(ExpenseActualsLookup::coveredWeeks())->toBeNull();

    [$config, , $expense] = manualFixture();
    ExpenseAttribution::create(['team_expense_id' => $expense->id, 'driver_config_id' => $config->id, 'week_start' => MWK, 'amount' => 100, 'paid_by' => 'company']);

    // A week with only manual attributions (no ledger) still counts as covered,
    // so the Actual toggle unlocks for it.
    expect(ExpenseActualsLookup::coveredWeeks())->toBe([MWK, MWK]);
});

// ---- Real $ visibility + manual override ----

test('a Real $ expense can be hidden from Actual via applies_to_actual=false', function () {
    $team = Team::factory()->create();
    $config = DriverConfig::factory()->for($team)->create(['contract_type' => DriverContractType::CompanyCpm]);
    $config->rates()->create(['tariff_rate' => 0.65, 'effective_from' => MWK]);
    $config->assignments()->create(['kind' => DriverAssignmentKind::Truck, 'value' => 'GL7005', 'effective_from' => MWK]);
    $config->load('rates', 'assignments');

    // Fleet Maintenance is ledger-backed but the user unchecked "Included".
    $expense = TeamExpense::factory()->for($team)->create([
        'name' => 'Fleet Maintenance',
        'calculation_type' => ExpenseCalculationType::PerMile,
        'actual_source' => ExpenseActualSource::Fleet,
        'applies_to_actual' => false,
    ]);
    $expense->rates()->create(['rate' => 0.20, 'effective_from' => MWK]);
    ExpenseActual::create(['source' => 'fleet', 'unit' => 'GL7005', 'week_start' => MWK, 'amount' => 500]);

    $expenses = collect([$expense->load('rates')]);
    $ledger = ExpenseActualsLookup::forWindow(CarbonImmutable::parse(MWK), CarbonImmutable::parse(MWK));
    $actual = app(AnalyticsService::class)->computeFinancials(
        $config, $expenses, mBuckets(), [CarbonImmutable::parse(MWK)], [MWK], 'actual', 'GL7005', $ledger
    );

    expect($actual['expenses'])->not->toHaveKey('Fleet Maintenance')
        ->and($actual['total_expenses'])->toBe(0.0);
});

test('the manual flag overrides the Real $ ledger for an actual_source expense', function () {
    $team = Team::factory()->create();
    $config = DriverConfig::factory()->for($team)->create(['contract_type' => DriverContractType::CompanyCpm]);
    $config->rates()->create(['tariff_rate' => 0.65, 'effective_from' => MWK]);
    $config->assignments()->create(['kind' => DriverAssignmentKind::Truck, 'value' => 'GL7005', 'effective_from' => MWK]);
    $config->load('rates', 'assignments');

    // Ledger-backed Fleet Maintenance, now flipped to manual.
    $expense = TeamExpense::factory()->for($team)->create([
        'name' => 'Fleet Maintenance',
        'calculation_type' => ExpenseCalculationType::PerMile,
        'actual_source' => ExpenseActualSource::Fleet,
        'is_manual' => true,
    ]);
    $expense->rates()->create(['rate' => 0.20, 'effective_from' => MWK]);
    ExpenseActual::create(['source' => 'fleet', 'unit' => 'GL7005', 'week_start' => MWK, 'amount' => 500]);
    ExpenseAttribution::create(['team_expense_id' => $expense->id, 'driver_config_id' => $config->id, 'week_start' => MWK, 'amount' => 1200, 'paid_by' => 'company']);

    $expenses = collect([$expense->load('rates')]);
    $ledger = ExpenseActualsLookup::forWindow(CarbonImmutable::parse(MWK), CarbonImmutable::parse(MWK));
    $manual = ManualAttributionLookup::forWindow([$expense->id], CarbonImmutable::parse(MWK), CarbonImmutable::parse(MWK));
    $actual = app(AnalyticsService::class)->computeFinancials(
        $config, $expenses, mBuckets(), [CarbonImmutable::parse(MWK)], [MWK], 'actual', 'GL7005', $ledger, $manual
    );

    // Manual attribution (1200) wins — not the 500 fleet ledger for GL7005.
    expect($actual['expenses']['Fleet Maintenance'])->toBe(1200.0);
});

// ---- CRUD endpoints ----

test('a team member can attach, edit and delete an attribution', function () {
    [$user, $team] = createTeamMember(TeamRole::Admin);
    $config = DriverConfig::factory()->for($team)->create(['contract_type' => DriverContractType::CompanyCpm]);
    $expense = TeamExpense::factory()->for($team)->create(['name' => 'Fleet Maintenance', 'is_manual' => true]);

    $this->actingAs($user)->from("/{$team->slug}/configuration")
        ->post(route('configuration.expenses.attributions.store', [$team, $expense]), [
            'driver_config_id' => $config->id, 'week_start' => MWK, 'amount' => 1234.56, 'paid_by' => 'company',
        ])->assertRedirect();

    $attr = $expense->attributions()->first();
    expect($attr->amount)->toBe(1234.56)->and($attr->paid_by)->toBe('company');

    $this->actingAs($user)->from("/{$team->slug}/configuration")
        ->patch(route('configuration.expenses.attributions.update', [$team, $expense, $attr]), [
            'driver_config_id' => $config->id, 'week_start' => MWK, 'amount' => 1000, 'paid_by' => 'driver',
        ])->assertRedirect();

    expect($attr->fresh()->paid_by)->toBe('driver');

    $this->actingAs($user)->from("/{$team->slug}/configuration")
        ->delete(route('configuration.expenses.attributions.destroy', [$team, $expense, $attr]))
        ->assertRedirect();

    expect($expense->attributions()->count())->toBe(0);
});

test('weeklyReport surfaces a manual attribution end-to-end (real threading path)', function () {
    // Exercises the production path: weeklyReport builds the ManualAttributionLookup
    // (via the is_manual contains-check) and threads it through to computeFinancials —
    // not the direct computeFinancials calls the other tests use.
    $team = Team::factory()->create(['data_source' => TeamDataSource::Xlsx]);
    $config = DriverConfig::factory()->for($team)->create([
        'contract_type' => DriverContractType::CompanyCpm,
        'external_driver_key' => 'test driver|',
    ]);
    $config->rates()->create(['tariff_rate' => 0.65, 'effective_from' => MWK]);

    $expense = TeamExpense::factory()->for($team)->create([
        'name' => 'Fleet Maintenance',
        'calculation_type' => ExpenseCalculationType::PerMile,
        'is_manual' => true,
        'applies_to_kpi' => false,
    ]);
    $expense->rates()->create(['rate' => 0.20, 'effective_from' => MWK]);

    ExpenseAttribution::create(['team_expense_id' => $expense->id, 'driver_config_id' => $config->id, 'week_start' => MWK, 'amount' => 2163.61, 'paid_by' => 'company']);

    XlsxDriverDay::create([
        'team_id' => $team->id, 'work_date' => MWK, 'driver_name' => 'Test Driver',
        'truck_number' => '', 'gross' => 5000, 'miles' => 1000, 'source_format' => 'test',
    ]);

    $rows = app(AnalyticsService::class)->weeklyReport(
        $team, CarbonImmutable::parse(MWK), CarbonImmutable::parse('2026-07-19'), 'actual'
    );
    $row = $rows->firstWhere('driver_name', 'Test Driver');

    expect($row)->not->toBeNull()
        ->and($row['expenses']['Fleet Maintenance'])->toBe(2163.61);
});

test('attaching a driver config from another team is rejected', function () {
    [$user, $team] = createTeamMember(TeamRole::Admin);
    $expense = TeamExpense::factory()->for($team)->create(['name' => 'Fleet Maintenance', 'is_manual' => true]);
    $otherConfig = DriverConfig::factory()->create(); // different team

    $this->actingAs($user)->from("/{$team->slug}/configuration")
        ->post(route('configuration.expenses.attributions.store', [$team, $expense]), [
            'driver_config_id' => $otherConfig->id, 'week_start' => MWK, 'amount' => 100, 'paid_by' => 'company',
        ])->assertSessionHasErrors('driver_config_id');

    expect($expense->attributions()->count())->toBe(0);
});
