<?php

namespace App\Models;

use App\Enums\DriverContractType;
use App\Enums\ExpenseCalculationType;
use Carbon\CarbonInterface;
use Database\Factories\TeamExpenseFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable([
    'team_id',
    'name',
    'description',
    'calculation_type',
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
     * Get this expense's rate history, oldest effective date first.
     *
     * @return HasMany<TeamExpenseRate, $this>
     */
    public function rates(): HasMany
    {
        return $this->hasMany(TeamExpenseRate::class)->orderBy('effective_from');
    }

    /**
     * Get the rate in force as of the given date. A rate applies within
     * [effective_from, effective_to] (a null effective_to is open-ended); when
     * several cover the date the most recent effective_from wins. Dates before
     * any rate begins fall back to the earliest rate for continuity; dates past
     * a bounded rate's end with no successor resolve to null (not charged).
     */
    public function rateAsOf(CarbonInterface $date): ?float
    {
        $sorted = $this->rates->sortBy('effective_from');

        $covering = $sorted
            ->filter(fn (TeamExpenseRate $rate) => $rate->effective_from->lessThanOrEqualTo($date)
                && ($rate->effective_to === null || $rate->effective_to->greaterThanOrEqualTo($date)))
            ->sortByDesc('effective_from')
            ->first();

        if ($covering) {
            return $covering->rate;
        }

        $earliest = $sorted->first();

        return $earliest && $date->lessThan($earliest->effective_from)
            ? $earliest->rate
            : null;
    }

    /**
     * Get the current (most recent) rate for this expense.
     */
    public function currentRate(): ?float
    {
        return $this->rates->sortBy('effective_from')->last()?->rate;
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
     * Calculate this expense amount for a driver's gross and miles using the
     * given rate (resolved for the reporting period).
     */
    public function calculate(float $rate, float $gross, float $miles): float
    {
        return $this->calculation_type->calculate($rate, $gross, $miles);
    }
}
