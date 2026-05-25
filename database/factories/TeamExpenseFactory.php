<?php

namespace Database\Factories;

use App\Enums\DriverContractType;
use App\Enums\ExpenseCalculationType;
use App\Models\Team;
use App\Models\TeamExpense;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<TeamExpense>
 */
class TeamExpenseFactory extends Factory
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
            'name' => $this->faker->words(3, asText: true),
            'description' => $this->faker->optional()->sentence(),
            'calculation_type' => $this->faker->randomElement(ExpenseCalculationType::cases()),
            'applies_to' => null,
            'sort_order' => 0,
        ];
    }

    /**
     * Give every expense an initial rate so it is usable out of the box.
     * `withRate()` replaces this default when an explicit rate is required.
     */
    public function configure(): static
    {
        return $this->afterCreating(function (TeamExpense $expense) {
            if ($expense->rates()->doesntExist()) {
                $expense->rates()->create([
                    'rate' => $this->faker->randomFloat(4, 0.01, 500),
                    'effective_from' => now()->startOfWeek()->toDateString(),
                ]);
            }
        });
    }

    /**
     * Set the expense's rate, replacing the default initial rate.
     */
    public function withRate(float $rate, ?string $effectiveFrom = null): static
    {
        return $this->afterCreating(function (TeamExpense $expense) use ($rate, $effectiveFrom) {
            $expense->rates()->delete();
            $expense->rates()->create([
                'rate' => $rate,
                'effective_from' => $effectiveFrom ?? now()->startOfWeek()->toDateString(),
            ]);
        });
    }

    /**
     * Per-mile expense (e.g. "20 Cent Fleet Rate").
     */
    public function perMile(string $name, float $rate): static
    {
        return $this->state(fn () => [
            'name' => $name,
            'calculation_type' => ExpenseCalculationType::PerMile,
        ])->withRate($rate);
    }

    /**
     * Percentage of gross expense (e.g. "Factoring Fee").
     */
    public function percentageOfGross(string $name, float $rate): static
    {
        return $this->state(fn () => [
            'name' => $name,
            'calculation_type' => ExpenseCalculationType::PercentageOfGross,
        ])->withRate($rate);
    }

    /**
     * Flat expense (e.g. "Net Toll").
     */
    public function flat(string $name, float $amount): static
    {
        return $this->state(fn () => [
            'name' => $name,
            'calculation_type' => ExpenseCalculationType::Flat,
        ])->withRate($amount);
    }

    /**
     * Restrict expense to specific contract types.
     *
     * @param  array<DriverContractType>  $types
     */
    public function appliesTo(array $types): static
    {
        return $this->state(fn () => [
            'applies_to' => array_map(fn (DriverContractType $t) => $t->value, $types),
        ]);
    }
}
