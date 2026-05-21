<?php

namespace App\Models;

use App\Enums\DriverContractType;
use App\Enums\ExpenseCalculationType;
use Database\Factories\TeamExpenseFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'team_id',
    'name',
    'description',
    'calculation_type',
    'rate',
    'applies_to',
    'skip_when_no_gross',
    'sort_order',
])]
class TeamExpense extends Model
{
    /** @use HasFactory<TeamExpenseFactory> */
    use HasFactory;

    /**
     * Get the casts for this model.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'calculation_type' => ExpenseCalculationType::class,
            'rate' => 'float',
            'applies_to' => 'array', // array<string> of DriverContractType values, or null for all
            'skip_when_no_gross' => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    /**
     * Get the team that owns this expense.
     *
     * @return BelongsTo<Team, $this>
     */
    public function team(): BelongsTo
    {
        return $this->belongsTo(Team::class);
    }

    /**
     * Determine whether this expense applies to the given contract type.
     */
    public function appliesToContractType(DriverContractType $type): bool
    {
        if ($this->applies_to === null) {
            return true;
        }

        return in_array($type->value, $this->applies_to, strict: true);
    }

    /**
     * Determine whether this expense applies to a driver given their contract
     * type and weekly gross. Expenses flagged with `skip_when_no_gross` are
     * suppressed for drivers who did no loads (gross = 0) in the period.
     */
    public function appliesToDriver(DriverContractType $type, float $gross): bool
    {
        if ($this->skip_when_no_gross && $gross <= 0) {
            return false;
        }

        return $this->appliesToContractType($type);
    }

    /**
     * Calculate this expense amount for a driver's gross and miles.
     */
    public function calculate(float $gross, float $miles): float
    {
        return $this->calculation_type->calculate($this->rate, $gross, $miles);
    }
}
