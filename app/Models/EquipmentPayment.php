<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable([
    'company',
    'kind',
    'unit',
    'monthly_amount',
    'effective_from',
    'effective_to',
])]
class EquipmentPayment extends Model
{
    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'monthly_amount' => 'float',
            'effective_from' => 'date',
            'effective_to' => 'date',
        ];
    }
}
