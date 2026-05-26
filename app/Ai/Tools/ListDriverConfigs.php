<?php

namespace App\Ai\Tools;

use App\Models\DriverConfig;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

class ListDriverConfigs extends AnalyticsTool implements Tool
{
    public function description(): Stringable|string
    {
        return "List the team's configured drivers with their contract type and current tariff rate (per-mile dollars for CPM, or a decimal fraction of gross for percentage contracts). Use for questions about driver contracts, pay rates, or who is configured.";
    }

    public function handle(Request $request): Stringable|string
    {
        $names = $this->analytics()->getDriverNames($this->team);

        $configs = $this->team->driverConfigs()->with('rates')->get()
            ->map(fn (DriverConfig $dc) => [
                'driver_id' => $dc->external_driver_id,
                'driver_name' => $names->get($dc->external_driver_id, "Driver #{$dc->external_driver_id}"),
                'contract_type' => $dc->contract_type->label(),
                'current_rate' => $dc->currentRate(),
            ])->values()->all();

        return $this->json([
            'team' => $this->team->name,
            'driver_count' => count($configs),
            'drivers' => $configs,
        ]);
    }

    public function schema(JsonSchema $schema): array
    {
        return [];
    }
}
