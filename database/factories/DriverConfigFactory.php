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
            'tariff_rate' => 0.6500,
        ];
    }

    /**
     * Company CPM driver state.
     */
    public function companyCpm(float $rate = 0.65): static
    {
        return $this->state(fn () => [
            'contract_type' => DriverContractType::CompanyCpm,
            'tariff_rate' => $rate,
        ]);
    }

    /**
     * Company percentage driver state.
     */
    public function companyPercentage(float $rate = 0.30): static
    {
        return $this->state(fn () => [
            'contract_type' => DriverContractType::CompanyPercentage,
            'tariff_rate' => $rate,
        ]);
    }

    /**
     * Lease operator driver state.
     */
    public function leaseOperator(float $rate = 0.90): static
    {
        return $this->state(fn () => [
            'contract_type' => DriverContractType::LeaseOperator,
            'tariff_rate' => $rate,
        ]);
    }

    /**
     * Owner operator driver state.
     */
    public function ownerOperator(float $rate = 0.90): static
    {
        return $this->state(fn () => [
            'contract_type' => DriverContractType::OwnerOperator,
            'tariff_rate' => $rate,
        ]);
    }
}
