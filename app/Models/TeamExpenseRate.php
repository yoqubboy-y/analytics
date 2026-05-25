<?php

namespace App\Models;

use Database\Factories\TeamExpenseRateFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'team_expense_id',
    'rate',
    'effective_from',
    'effective_to',
])]
class TeamExpenseRate extends Model
{
    /** @use HasFactory<TeamExpenseRateFactory> */
    use HasFactory;

    /**
     * Get the casts for this model.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'rate' => 'float',
            'effective_from' => 'date',
            'effective_to' => 'date',
        ];
    }

    /**
     * Get the expense this rate belongs to.
     *
     * @return BelongsTo<TeamExpense, $this>
     */
    public function teamExpense(): BelongsTo
    {
        return $this->belongsTo(TeamExpense::class);
    }
}
