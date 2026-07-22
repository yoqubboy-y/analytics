<?php

namespace Database\Factories;

use App\Models\DriverConfig;
use App\Models\ExpenseAttribution;
use App\Models\TeamExpense;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ExpenseAttribution>
 */
class ExpenseAttributionFactory extends Factory
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
            'driver_config_id' => DriverConfig::factory(),
            'week_start' => now()->startOfWeek()->toDateString(),
            'amount' => $this->faker->randomFloat(2, 50, 3000),
            'paid_by' => 'company',
            'note' => null,
        ];
    }
}
