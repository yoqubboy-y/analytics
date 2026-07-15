<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable([
    'company',
    'source',
    'unit',
    'week_start',
    'amount',
    'category',
    'driver_name',
    'txn_date',
    'source_filename',
])]
class ExpenseActual extends Model
{
    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'week_start' => 'date',
            'amount' => 'float',
            'txn_date' => 'date',
        ];
    }
}
