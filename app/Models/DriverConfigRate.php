<?php

namespace App\Models;

use Database\Factories\DriverConfigRateFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'driver_config_id',
    'tariff_rate',
    'effective_from',
    'effective_to',
])]
class DriverConfigRate extends Model
{
    /** @use HasFactory<DriverConfigRateFactory> */
    use HasFactory;

    /**
     * Get the casts for this model.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'tariff_rate' => 'float',
            'effective_from' => 'date',
            'effective_to' => 'date',
        ];
    }

    /**
     * Get the driver config this rate belongs to.
     *
     * @return BelongsTo<DriverConfig, $this>
     */
    public function driverConfig(): BelongsTo
    {
        return $this->belongsTo(DriverConfig::class);
    }
}
