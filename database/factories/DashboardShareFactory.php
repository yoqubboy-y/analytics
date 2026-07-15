<?php

namespace Database\Factories;

use App\Models\DashboardShare;
use App\Models\Team;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<DashboardShare>
 */
class DashboardShareFactory extends Factory
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
            'token' => Str::random(40),
            'start_date' => now()->startOfWeek()->toDateString(),
            'end_date' => now()->endOfWeek()->toDateString(),
            'basis' => 'kpi',
            'created_by' => null,
            'expires_at' => null,
            'revoked_at' => null,
        ];
    }

    /**
     * A revoked share.
     */
    public function revoked(): static
    {
        return $this->state(fn () => ['revoked_at' => now()]);
    }

    /**
     * An expired share.
     */
    public function expired(): static
    {
        return $this->state(fn () => ['expires_at' => now()->subDay()]);
    }
}
