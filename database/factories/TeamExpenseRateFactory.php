<?php

namespace Database\Factories;

use App\Models\TeamExpense;
use App\Models\TeamExpenseRate;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<TeamExpenseRate>
 */
class TeamExpenseRateFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'team_expense_id' => TeamExpense::factory(),
            'rate' => $this->faker->randomFloat(4, 0.01, 500),
            'effective_from' => now()->startOfWeek()->toDateString(),
        ];
    }
}
