<?php

namespace App\Http\Controllers\Analytics;

use App\Enums\DriverContractType;
use App\Enums\ExpenseCalculationType;
use App\Http\Controllers\Controller;
use App\Models\DriverConfig;
use App\Models\Team;
use App\Models\TeamExpense;
use App\Services\AnalyticsService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class ConfigurationController extends Controller
{
    public function __construct(private AnalyticsService $analytics) {}

    public function index(Team $currentTeam): Response
    {
        $driverNames = $this->analytics->getDriverNames($currentTeam);

        return Inertia::render('analytics/configuration', [
            'driverConfigs' => $currentTeam->driverConfigs
                ->map(fn (DriverConfig $dc) => [
                    'id' => $dc->id,
                    'external_driver_id' => $dc->external_driver_id,
                    'driver_name' => $driverNames->get($dc->external_driver_id, "Driver #{$dc->external_driver_id}"),
                    'contract_type' => $dc->contract_type->value,
                    'tariff_rate' => $dc->tariff_rate,
                ])->values(),
            'expenses' => $currentTeam->expenses
                ->map(fn (TeamExpense $e) => [
                    'id' => $e->id,
                    'name' => $e->name,
                    'description' => $e->description,
                    'calculation_type' => $e->calculation_type->value,
                    'rate' => $e->rate,
                    'applies_to' => $e->applies_to,
                    'sort_order' => $e->sort_order,
                ])->values(),
            'contractTypes' => array_map(fn ($c) => [
                'value' => $c->value,
                'label' => $c->label(),
            ], DriverContractType::cases()),
            'calculationTypes' => array_map(fn ($c) => [
                'value' => $c->value,
                'label' => $c->label(),
            ], ExpenseCalculationType::cases()),
        ]);
    }

    public function updateDriverConfig(Request $request, Team $currentTeam, DriverConfig $driverConfig): RedirectResponse
    {
        $data = $request->validate([
            'contract_type' => ['required', Rule::enum(DriverContractType::class)],
            'tariff_rate' => ['required', 'numeric', 'min:0', 'max:9999'],
        ]);

        $driverConfig->update($data);

        return back();
    }

    public function storeExpense(Request $request, Team $currentTeam): RedirectResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:500'],
            'calculation_type' => ['required', Rule::enum(ExpenseCalculationType::class)],
            'rate' => ['required', 'numeric', 'min:0'],
            'applies_to' => ['nullable', 'array'],
            'applies_to.*' => [Rule::enum(DriverContractType::class)],
            'sort_order' => ['integer', 'min:0'],
        ]);

        $currentTeam->expenses()->create($data);

        return back();
    }

    public function updateExpense(Request $request, Team $currentTeam, TeamExpense $teamExpense): RedirectResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:500'],
            'calculation_type' => ['required', Rule::enum(ExpenseCalculationType::class)],
            'rate' => ['required', 'numeric', 'min:0'],
            'applies_to' => ['nullable', 'array'],
            'applies_to.*' => [Rule::enum(DriverContractType::class)],
            'sort_order' => ['integer', 'min:0'],
        ]);

        $teamExpense->update($data);

        return back();
    }

    public function destroyExpense(Team $currentTeam, TeamExpense $teamExpense): RedirectResponse
    {
        $teamExpense->delete();

        return back();
    }
}
