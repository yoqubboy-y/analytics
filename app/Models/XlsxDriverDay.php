<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'team_id',
    'work_date',
    'driver_name',
    'truck_number',
    'dispatcher',
    'load_id',
    'gross',
    'miles',
    'status',
    'source_format',
    'source_sheet',
    'source_filename',
])]
class XlsxDriverDay extends Model
{
    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'work_date' => 'date',
            'gross' => 'float',
            'miles' => 'float',
        ];
    }

    /**
     * @return BelongsTo<Team, $this>
     */
    public function team(): BelongsTo
    {
        return $this->belongsTo(Team::class);
    }
}
