<?php

namespace App\Http\Controllers\Analytics;

use App\Enums\DriverAssignmentKind;
use App\Enums\DriverContractType;
use App\Enums\ExpenseCalculationType;
use App\Enums\TeamDataSource;
use App\Enums\TeamPermission;
use App\Http\Controllers\Controller;
use App\Models\DriverConfig;
use App\Models\DriverConfigAssignment;
use App\Models\DriverConfigRate;
use App\Models\Team;
use App\Models\TeamExpense;
use App\Models\TeamExpenseRate;
use App\Services\AnalyticsService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class ConfigurationController extends Controller
{
    public function __construct(private AnalyticsService $analytics) {}

    public function index(Team $currentTeam): Response
    {
        $isXlsx = $currentTeam->data_source === TeamDataSource::Xlsx;

        $driverNames = $this->analytics->getDriverNames($currentTeam);

        $user = Auth::user();
        $lastImport = $currentTeam->xlsxDriverDays()->latest('id')->first();

        $importSummary = [
            'total_rows' => $currentTeam->xlsxDriverDays()->count(),
            'min_date' => optional($currentTeam->xlsxDriverDays()->min('work_date'))
                ? (string) $currentTeam->xlsxDriverDays()->min('work_date')
                : null,
            'max_date' => optional($currentTeam->xlsxDriverDays()->max('work_date'))
                ? (string) $currentTeam->xlsxDriverDays()->max('work_date')
                : null,
            'last_filename' => $lastImport?->source_filename,
            'last_format' => $lastImport?->source_format,
            'last_imported_at' => optional($lastImport?->created_at)?->toDateTimeString(),
        ];

        // Distinct (driver_name, truck_number) pairs from this team's
        // imported rows, keyed by the same `external_driver_key` the
        // service uses for aggregation. Drives the XLSX driver picker.
        $importedDrivers = $isXlsx
            ? $currentTeam->xlsxDriverDays()
                ->selectRaw('driver_name, truck_number, MIN(dispatcher) as dispatcher')
                ->groupBy('driver_name', 'truck_number')
                ->orderBy('driver_name')
                ->get()
                ->map(fn ($row) => [
                    'external_driver_key' => $this->analytics->xlsxDriverKey($row->driver_name, $row->truck_number),
                    'driver_name' => $row->driver_name,
                    'truck_number' => $row->truck_number,
                ])
                ->values()
            : collect();

        return Inertia::render('analytics/configuration', [
            'dataSource' => $currentTeam->data_source->value,
            'canImport' => $user?->hasTeamPermission($currentTeam, TeamPermission::ImportXlsx) ?? false,
            'canChangeDataSource' => $user?->hasTeamPermission($currentTeam, TeamPermission::UpdateTeam) ?? false,
            'importSummary' => $importSummary,
            'importedDrivers' => $importedDrivers,
            'driverConfigs' => $currentTeam->driverConfigs->load('rates', 'assignments')
                ->map(fn (DriverConfig $dc) => [
                    'id' => $dc->id,
                    'external_driver_id' => $dc->external_driver_id,
                    'external_driver_key' => $dc->external_driver_key,
                    'driver_name' => $this->resolveDriverName($dc, $driverNames),
                    'dispatcher' => $dc->dispatcher,
                    'contract_type' => $dc->contract_type->value,
                    'current_rate' => $dc->currentRate(),
                    'rates' => $dc->rates->sortByDesc('effective_from')->values()
                        ->map(fn (DriverConfigRate $r) => [
                            'id' => $r->id,
                            'tariff_rate' => $r->tariff_rate,
                            'effective_from' => $r->effective_from->toDateString(),
                            'effective_to' => $r->effective_to?->toDateString(),
                        ])->all(),
                    'assignments' => $dc->assignments->sortByDesc('effective_from')->values()
                        ->map(fn (DriverConfigAssignment $a) => [
                            'id' => $a->id,
                            'kind' => $a->kind->value,
                            'value' => $a->value,
                            'effective_from' => $a->effective_from->toDateString(),
                            'effective_to' => $a->effective_to?->toDateString(),
                        ])->all(),
                ])->values(),
            'expenses' => $currentTeam->expenses->load('rates')
                ->map(fn (TeamExpense $e) => [
                    'id' => $e->id,
                    'name' => $e->name,
                    'description' => $e->description,
                    'calculation_type' => $e->calculation_type->value,
                    // actual_source (read-only) flags the 5 file-backed expenses
                    // so the UI can show they always pull real dollars; applies_to_actual
                    // is the editable "include in the Actual P&L" toggle for the rest.
                    'actual_source' => $e->actual_source?->value,
                    'applies_to_actual' => $e->applies_to_actual,
                    'applies_to_kpi' => $e->applies_to_kpi,
                    'current_rate' => $e->currentRate(),
                    'rates' => $e->rates->sortByDesc('effective_from')->values()
                        ->map(fn (TeamExpenseRate $r) => [
                            'id' => $r->id,
                            'rate' => $r->rate,
                            'effective_from' => $r->effective_from->toDateString(),
                            'effective_to' => $r->effective_to?->toDateString(),
                        ])->all(),
                    'applies_to' => $e->applies_to,
                    'driver_paid_contract_types' => $e->driver_paid_contract_types,
                    'skip_when_no_gross' => $e->skip_when_no_gross,
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

    public function storeDriverConfig(Request $request, Team $currentTeam): RedirectResponse
    {
        $isXlsx = $currentTeam->data_source === TeamDataSource::Xlsx;

        $data = $request->validate([
            // Analytics-DB teams identify drivers by numeric id; XLSX teams
            // by the `name|TRUCK` key produced from the import. Exactly one
            // applies per team.
            'external_driver_id' => $isXlsx
                ? ['nullable']
                : ['required', 'integer', 'min:1', Rule::unique('driver_configs')->where('team_id', $currentTeam->id)],
            'external_driver_key' => $isXlsx
                ? ['required', 'string', 'max:255', Rule::unique('driver_configs')->where('team_id', $currentTeam->id)]
                : ['nullable'],
            'dispatcher' => ['nullable', 'string', 'max:255'],
            'contract_type' => ['required', Rule::enum(DriverContractType::class)],
            'tariff_rate' => ['required', 'numeric', 'min:0', 'max:9999'],
            'effective_from' => ['required', 'date'],
            'effective_to' => ['nullable', 'date', 'after_or_equal:effective_from'],
            // Optional starting truck/trailer units — attached as open-ended
            // assignments from the same effective week, so a brand-new config
            // is born with the units that drive its actuals already in place.
            'truck' => ['nullable', 'string', 'max:255'],
            'trailer' => ['nullable', 'string', 'max:255'],
        ]);

        $config = $currentTeam->driverConfigs()->create([
            'external_driver_id' => $isXlsx ? null : $data['external_driver_id'],
            'external_driver_key' => $isXlsx ? $data['external_driver_key'] : null,
            'dispatcher' => $data['dispatcher'] ?? null,
            'contract_type' => $data['contract_type'],
        ]);

        $config->rates()->create([
            'tariff_rate' => $data['tariff_rate'],
            'effective_from' => $data['effective_from'],
            'effective_to' => $data['effective_to'] ?? null,
        ]);

        foreach ([DriverAssignmentKind::Truck, DriverAssignmentKind::Trailer] as $kind) {
            $value = trim((string) ($data[$kind->value] ?? ''));

            if ($value !== '') {
                $config->assignments()->create([
                    'kind' => $kind,
                    'value' => $value,
                    'effective_from' => $data['effective_from'],
                    'effective_to' => null,
                ]);
            }
        }

        return back();
    }

    public function updateDriverConfig(Request $request, Team $currentTeam, DriverConfig $driverConfig): RedirectResponse
    {
        $this->ensureBelongsToTeam($driverConfig->team_id, $currentTeam);

        $data = $request->validate([
            'contract_type' => ['required', Rule::enum(DriverContractType::class)],
            'dispatcher' => ['nullable', 'string', 'max:255'],
        ]);

        $driverConfig->update([
            'contract_type' => $data['contract_type'],
            'dispatcher' => $data['dispatcher'] ?? null,
        ]);

        return back();
    }

    public function storeDriverConfigRate(Request $request, Team $currentTeam, DriverConfig $driverConfig): RedirectResponse
    {
        $this->ensureBelongsToTeam($driverConfig->team_id, $currentTeam);

        $data = $request->validate([
            'tariff_rate' => ['required', 'numeric', 'min:0', 'max:9999'],
            'effective_from' => ['required', 'date'],
            'effective_to' => ['nullable', 'date', 'after_or_equal:effective_from'],
        ]);

        // One rate per effective date: a second change in the same week replaces it.
        $existing = $driverConfig->rates()->whereDate('effective_from', $data['effective_from'])->first();

        if ($existing) {
            $existing->update([
                'tariff_rate' => $data['tariff_rate'],
                'effective_to' => $data['effective_to'] ?? null,
            ]);
        } else {
            $driverConfig->rates()->create([
                'tariff_rate' => $data['tariff_rate'],
                'effective_from' => $data['effective_from'],
                'effective_to' => $data['effective_to'] ?? null,
            ]);
        }

        return back();
    }

    public function updateDriverConfigRate(Request $request, Team $currentTeam, DriverConfig $driverConfig, DriverConfigRate $driverConfigRate): RedirectResponse
    {
        $this->ensureBelongsToTeam($driverConfig->team_id, $currentTeam);
        $this->ensureRateBelongsToParent($driverConfigRate->driver_config_id, $driverConfig->id);

        $data = $request->validate([
            'tariff_rate' => ['required', 'numeric', 'min:0', 'max:9999'],
            'effective_from' => ['required', 'date'],
            'effective_to' => ['nullable', 'date', 'after_or_equal:effective_from'],
        ]);

        $driverConfigRate->update([
            'tariff_rate' => $data['tariff_rate'],
            'effective_from' => $data['effective_from'],
            'effective_to' => $data['effective_to'] ?? null,
        ]);

        return back();
    }

    public function destroyDriverConfigRate(Team $currentTeam, DriverConfig $driverConfig, DriverConfigRate $driverConfigRate): RedirectResponse
    {
        $this->ensureBelongsToTeam($driverConfig->team_id, $currentTeam);
        $this->ensureRateBelongsToParent($driverConfigRate->driver_config_id, $driverConfig->id);

        if ($driverConfig->rates()->count() <= 1) {
            return back()->withErrors(['rate' => 'A driver config must keep at least one rate.']);
        }

        $driverConfigRate->delete();

        return back();
    }

    public function storeDriverConfigAssignment(Request $request, Team $currentTeam, DriverConfig $driverConfig): RedirectResponse
    {
        $this->ensureBelongsToTeam($driverConfig->team_id, $currentTeam);

        $data = $this->validateAssignment($request);

        // One assignment per (kind, effective date): re-entering the same start
        // week replaces it rather than stacking a duplicate.
        $existing = $driverConfig->assignments()
            ->where('kind', $data['kind'])
            ->whereDate('effective_from', $data['effective_from'])
            ->first();

        if ($existing) {
            $existing->update([
                'value' => $data['value'],
                'effective_to' => $data['effective_to'] ?? null,
            ]);
        } else {
            $driverConfig->assignments()->create($data);
        }

        return back();
    }

    public function updateDriverConfigAssignment(Request $request, Team $currentTeam, DriverConfig $driverConfig, DriverConfigAssignment $assignment): RedirectResponse
    {
        $this->ensureBelongsToTeam($driverConfig->team_id, $currentTeam);
        $this->ensureRateBelongsToParent($assignment->driver_config_id, $driverConfig->id);

        $assignment->update($this->validateAssignment($request));

        return back();
    }

    public function destroyDriverConfigAssignment(Team $currentTeam, DriverConfig $driverConfig, DriverConfigAssignment $assignment): RedirectResponse
    {
        $this->ensureBelongsToTeam($driverConfig->team_id, $currentTeam);
        $this->ensureRateBelongsToParent($assignment->driver_config_id, $driverConfig->id);

        // Unlike tariff rates, an assignment history may legitimately be empty.
        $assignment->delete();

        return back();
    }

    /**
     * @return array{kind: string, value: string, effective_from: string, effective_to: ?string}
     */
    private function validateAssignment(Request $request): array
    {
        $data = $request->validate([
            'kind' => ['required', Rule::enum(DriverAssignmentKind::class)],
            'value' => ['required', 'string', 'max:255'],
            'effective_from' => ['required', 'date'],
            'effective_to' => ['nullable', 'date', 'after_or_equal:effective_from'],
        ]);

        $data['value'] = trim($data['value']);
        $data['effective_to'] = $data['effective_to'] ?? null;

        return $data;
    }

    public function storeExpense(Request $request, Team $currentTeam): RedirectResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:500'],
            'calculation_type' => ['required', Rule::enum(ExpenseCalculationType::class)],
            'applies_to_actual' => ['boolean'],
            'applies_to_kpi' => ['boolean'],
            'rate' => ['required', 'numeric', 'min:0'],
            'effective_from' => ['required', 'date'],
            'effective_to' => ['nullable', 'date', 'after_or_equal:effective_from'],
            'applies_to' => ['nullable', 'array'],
            'applies_to.*' => [Rule::enum(DriverContractType::class)],
            'driver_paid_contract_types' => ['nullable', 'array'],
            'driver_paid_contract_types.*' => [Rule::enum(DriverContractType::class)],
            'skip_when_no_gross' => ['boolean'],
            'sort_order' => ['integer', 'min:0'],
        ]);

        $expense = $currentTeam->expenses()->create([
            'name' => $data['name'],
            'description' => $data['description'] ?? null,
            'calculation_type' => $data['calculation_type'],
            'applies_to_actual' => $data['applies_to_actual'] ?? true,
            'applies_to_kpi' => $data['applies_to_kpi'] ?? true,
            'applies_to' => $data['applies_to'] ?? null,
            'driver_paid_contract_types' => $data['driver_paid_contract_types'] ?? null,
            'skip_when_no_gross' => $data['skip_when_no_gross'] ?? false,
            'sort_order' => $data['sort_order'] ?? 0,
        ]);

        $expense->rates()->create([
            'rate' => $data['rate'],
            'effective_from' => $data['effective_from'],
            'effective_to' => $data['effective_to'] ?? null,
        ]);

        return back();
    }

    public function updateExpense(Request $request, Team $currentTeam, TeamExpense $teamExpense): RedirectResponse
    {
        $this->ensureBelongsToTeam($teamExpense->team_id, $currentTeam);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:500'],
            'calculation_type' => ['required', Rule::enum(ExpenseCalculationType::class)],
            'applies_to_actual' => ['boolean'],
            'applies_to_kpi' => ['boolean'],
            'applies_to' => ['nullable', 'array'],
            'applies_to.*' => [Rule::enum(DriverContractType::class)],
            'driver_paid_contract_types' => ['nullable', 'array'],
            'driver_paid_contract_types.*' => [Rule::enum(DriverContractType::class)],
            'skip_when_no_gross' => ['boolean'],
            'sort_order' => ['integer', 'min:0'],
        ]);

        $teamExpense->update($data);

        return back();
    }

    public function destroyExpense(Team $currentTeam, TeamExpense $teamExpense): RedirectResponse
    {
        $this->ensureBelongsToTeam($teamExpense->team_id, $currentTeam);

        $teamExpense->delete();

        return back();
    }

    public function storeExpenseRate(Request $request, Team $currentTeam, TeamExpense $teamExpense): RedirectResponse
    {
        $this->ensureBelongsToTeam($teamExpense->team_id, $currentTeam);

        $data = $request->validate([
            'rate' => ['required', 'numeric', 'min:0'],
            'effective_from' => ['required', 'date'],
            'effective_to' => ['nullable', 'date', 'after_or_equal:effective_from'],
        ]);

        // One rate per effective date: a second change in the same week replaces it.
        $existing = $teamExpense->rates()->whereDate('effective_from', $data['effective_from'])->first();

        if ($existing) {
            $existing->update([
                'rate' => $data['rate'],
                'effective_to' => $data['effective_to'] ?? null,
            ]);
        } else {
            $teamExpense->rates()->create([
                'rate' => $data['rate'],
                'effective_from' => $data['effective_from'],
                'effective_to' => $data['effective_to'] ?? null,
            ]);
        }

        return back();
    }

    public function updateExpenseRate(Request $request, Team $currentTeam, TeamExpense $teamExpense, TeamExpenseRate $teamExpenseRate): RedirectResponse
    {
        $this->ensureBelongsToTeam($teamExpense->team_id, $currentTeam);
        $this->ensureRateBelongsToParent($teamExpenseRate->team_expense_id, $teamExpense->id);

        $data = $request->validate([
            'rate' => ['required', 'numeric', 'min:0'],
            'effective_from' => ['required', 'date'],
            'effective_to' => ['nullable', 'date', 'after_or_equal:effective_from'],
        ]);

        $teamExpenseRate->update([
            'rate' => $data['rate'],
            'effective_from' => $data['effective_from'],
            'effective_to' => $data['effective_to'] ?? null,
        ]);

        return back();
    }

    public function destroyExpenseRate(Team $currentTeam, TeamExpense $teamExpense, TeamExpenseRate $teamExpenseRate): RedirectResponse
    {
        $this->ensureBelongsToTeam($teamExpense->team_id, $currentTeam);
        $this->ensureRateBelongsToParent($teamExpenseRate->team_expense_id, $teamExpense->id);

        if ($teamExpense->rates()->count() <= 1) {
            return back()->withErrors(['rate' => 'An expense must keep at least one rate.']);
        }

        $teamExpenseRate->delete();

        return back();
    }

    /**
     * Ensure the given resource belongs to the current team.
     */
    private function ensureBelongsToTeam(int $teamId, Team $currentTeam): void
    {
        abort_unless($teamId === $currentTeam->id, 403);
    }

    /**
     * Pick the human-readable name for a config row. Analytics-DB configs
     * look up the name in the remote drivers table; XLSX configs already
     * carry the name in the `external_driver_key` (`lower(name)|TRUCK`).
     */
    private function resolveDriverName(DriverConfig $dc, Collection $driverNames): string
    {
        if ($dc->external_driver_id !== null) {
            return $driverNames->get($dc->external_driver_id, "Driver #{$dc->external_driver_id}");
        }

        // `<lower-name>|<TRUCK>` — strip the truck and re-capitalise.
        $name = explode('|', (string) $dc->external_driver_key)[0] ?? '';

        return $name === '' ? '(unknown)' : Str::title($name);
    }

    /**
     * Ensure a rate row belongs to the expected parent resource.
     */
    private function ensureRateBelongsToParent(int $rateParentId, int $parentId): void
    {
        abort_unless($rateParentId === $parentId, 403);
    }
}
