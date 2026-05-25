<?php

namespace Database\Factories;

use App\Models\DriverConfig;
use App\Models\DriverConfigRate;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<DriverConfigRate>
 */
class DriverConfigRateFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'driver_config_id' => DriverConfig::factory(),
            'tariff_rate' => 0.6500,
            'effective_from' => now()->startOfWeek()->toDateString(),
        ];
    }
}
