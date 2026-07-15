<?php

namespace App\Models;

use App\Enums\DriverAssignmentKind;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'driver_config_id',
    'kind',
    'value',
    'effective_from',
    'effective_to',
])]
class DriverConfigAssignment extends Model
{
    /**
     * Get the casts for this model.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'kind' => DriverAssignmentKind::class,
            'effective_from' => 'date',
            'effective_to' => 'date',
        ];
    }

    /**
     * Get the driver config this assignment belongs to.
     *
     * @return BelongsTo<DriverConfig, $this>
     */
    public function driverConfig(): BelongsTo
    {
        return $this->belongsTo(DriverConfig::class);
    }
}
