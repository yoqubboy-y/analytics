<?php

namespace App\Models;

use Database\Factories\ExpenseAttributionFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A hand-entered dollar amount attributing a manual expense to one driver
 * config for one ISO week. Under `basis=actual`, a manual expense sums these
 * (instead of matching a ledger by unit). `paid_by` mirrors the existing
 * driver-paid split: 'company' is a real carrier cost, 'driver' is a
 * pass-through the driver covers (rendered negative, excluded from Total Exp.).
 */
#[Fillable([
    'team_expense_id',
    'driver_config_id',
    'week_start',
    'amount',
    'paid_by',
    'note',
])]
class ExpenseAttribution extends Model
{
    /** @use HasFactory<ExpenseAttributionFactory> */
    use HasFactory;

    /**
     * Get the casts for this model.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'week_start' => 'date',
            'amount' => 'float',
        ];
    }

    /**
     * The manual expense this attribution belongs to.
     *
     * @return BelongsTo<TeamExpense, $this>
     */
    public function expense(): BelongsTo
    {
        return $this->belongsTo(TeamExpense::class, 'team_expense_id');
    }

    /**
     * The driver config this amount lands on.
     *
     * @return BelongsTo<DriverConfig, $this>
     */
    public function driverConfig(): BelongsTo
    {
        return $this->belongsTo(DriverConfig::class);
    }
}
