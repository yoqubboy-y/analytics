<?php

namespace App\Models;

use App\Enums\DriverContractType;
use Database\Factories\DriverConfigFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'team_id',
    'external_driver_id',
    'contract_type',
    'tariff_rate',
])]
class DriverConfig extends Model
{
    /** @use HasFactory<DriverConfigFactory> */
    use HasFactory;

    /**
     * Get the casts for this model.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'external_driver_id' => 'integer',
            'contract_type' => DriverContractType::class,
            'tariff_rate' => 'float',
        ];
    }

    /**
     * Get the team that owns this config.
     *
     * @return BelongsTo<Team, $this>
     */
    public function team(): BelongsTo
    {
        return $this->belongsTo(Team::class);
    }

    /**
     * Calculate the salary for this driver given their gross and miles.
     */
    public function calculateSalary(float $totalGross, float $totalMiles, bool $isTeam): float
    {
        return match ($this->contract_type) {
            DriverContractType::CompanyCpm => round($totalMiles * $this->tariff_rate, 2),
            DriverContractType::CompanyPercentage,
            DriverContractType::LeaseOperator,
            DriverContractType::LeaseOwner,
            DriverContractType::OwnerOperator => round($totalGross * $this->tariff_rate, 2),
        };
    }
}
