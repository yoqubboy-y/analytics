<?php

namespace Database\Factories;

use App\Enums\DriverContractType;
use App\Models\DriverConfig;
use App\Models\Team;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<DriverConfig>
 */
class DriverConfigFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'team_id' => Team::factory(),
            'external_driver_id' => $this->faker->unique()->numberBetween(1, 99999),
            'contract_type' => DriverContractType::CompanyCpm,
        ];
    }

    /**
     * Give every config an initial tariff rate so it is usable out of the box.
     * `withTariff()` replaces this default when an explicit rate is required.
     */
    public function configure(): static
    {
        return $this->afterCreating(function (DriverConfig $config) {
            if ($config->rates()->doesntExist()) {
                $config->rates()->create([
                    'tariff_rate' => 0.6500,
                    'effective_from' => now()->startOfWeek()->toDateString(),
                ]);
            }
        });
    }

    /**
     * Set the config's tariff rate, replacing the default initial rate.
     */
    public function withTariff(float $rate, ?string $effectiveFrom = null): static
    {
        return $this->afterCreating(function (DriverConfig $config) use ($rate, $effectiveFrom) {
            $config->rates()->delete();
            $config->rates()->create([
                'tariff_rate' => $rate,
                'effective_from' => $effectiveFrom ?? now()->startOfWeek()->toDateString(),
            ]);
        });
    }

    /**
     * Company CPM driver state.
     */
    public function companyCpm(float $rate = 0.65): static
    {
        return $this->state(fn () => [
            'contract_type' => DriverContractType::CompanyCpm,
        ])->withTariff($rate);
    }

    /**
     * Company percentage driver state.
     */
    public function companyPercentage(float $rate = 0.30): static
    {
        return $this->state(fn () => [
            'contract_type' => DriverContractType::CompanyPercentage,
        ])->withTariff($rate);
    }

    /**
     * Lease operator driver state.
     */
    public function leaseOperator(float $rate = 0.90): static
    {
        return $this->state(fn () => [
            'contract_type' => DriverContractType::LeaseOperator,
        ])->withTariff($rate);
    }

    /**
     * Owner operator driver state.
     */
    public function ownerOperator(float $rate = 0.90): static
    {
        return $this->state(fn () => [
            'contract_type' => DriverContractType::OwnerOperator,
        ])->withTariff($rate);
    }
}
