<?php

namespace App\Models;

use App\Enums\DriverAssignmentKind;
use App\Enums\DriverContractType;
use Carbon\CarbonInterface;
use Database\Factories\DriverConfigFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable([
    'team_id',
    'external_driver_id',
    'external_driver_key',
    'dispatcher',
    'contract_type',
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
     * Get this config's tariff rate history, oldest effective date first.
     *
     * @return HasMany<DriverConfigRate, $this>
     */
    public function rates(): HasMany
    {
        return $this->hasMany(DriverConfigRate::class)->orderBy('effective_from');
    }

    /**
     * Get the tariff rate in force as of the given date. A rate applies within
     * [effective_from, effective_to] (a null effective_to is open-ended); when
     * several cover the date the most recent effective_from wins. Dates before
     * any rate begins fall back to the earliest rate for continuity; dates past
     * a bounded rate's end with no successor resolve to null.
     */
    public function tariffRateAsOf(CarbonInterface $date): ?float
    {
        $sorted = $this->rates->sortBy('effective_from');

        $covering = $sorted
            ->filter(fn (DriverConfigRate $rate) => $rate->effective_from->lessThanOrEqualTo($date)
                && ($rate->effective_to === null || $rate->effective_to->greaterThanOrEqualTo($date)))
            ->sortByDesc('effective_from')
            ->first();

        if ($covering) {
            return $covering->tariff_rate;
        }

        $earliest = $sorted->first();

        return $earliest && $date->lessThan($earliest->effective_from)
            ? $earliest->tariff_rate
            : null;
    }

    /**
     * Get the current (most recent) tariff rate for this config.
     */
    public function currentRate(): ?float
    {
        return $this->rates->sortBy('effective_from')->last()?->tariff_rate;
    }

    /**
     * Get this config's time-versioned truck / trailer / dispatcher
     * assignments, oldest effective date first.
     *
     * @return HasMany<DriverConfigAssignment, $this>
     */
    public function assignments(): HasMany
    {
        return $this->hasMany(DriverConfigAssignment::class)->orderBy('effective_from');
    }

    /**
     * Resolve the assignment value (truck/trailer number or dispatcher name)
     * of the given kind in force as of a date. Same resolution as
     * {@see tariffRateAsOf()}: a row applies within [effective_from,
     * effective_to] (null effective_to is open-ended); the most recent
     * effective_from wins; dates before the first fall back to the earliest;
     * dates past a bounded end with no successor resolve to null.
     */
    public function assignmentAsOf(DriverAssignmentKind $kind, CarbonInterface $date): ?string
    {
        $ofKind = $this->assignments
            ->where('kind', $kind)
            ->sortBy('effective_from');

        $covering = $ofKind
            ->filter(fn (DriverConfigAssignment $a) => $a->effective_from->lessThanOrEqualTo($date)
                && ($a->effective_to === null || $a->effective_to->greaterThanOrEqualTo($date)))
            ->sortByDesc('effective_from')
            ->first();

        if ($covering) {
            return $covering->value;
        }

        $earliest = $ofKind->first();

        return $earliest && $date->lessThan($earliest->effective_from)
            ? $earliest->value
            : null;
    }

    /**
     * Calculate the salary for this driver given the resolved tariff rate, their
     * gross and miles.
     */
    public function calculateSalary(float $tariffRate, float $totalGross, float $totalMiles, bool $isTeam): float
    {
        return match ($this->contract_type) {
            DriverContractType::CompanyCpm => round($totalMiles * $tariffRate, 2),
            DriverContractType::CompanyPercentage,
            DriverContractType::LeaseOperator,
            DriverContractType::LeaseOwner,
            DriverContractType::OwnerOperator => round($totalGross * $tariffRate, 2),
        };
    }
}
