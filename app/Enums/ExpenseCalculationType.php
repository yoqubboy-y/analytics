<?php

namespace App\Enums;

enum ExpenseCalculationType: string
{
    case PerMile = 'per_mile';
    case PercentageOfGross = 'percentage_of_gross';
    case Flat = 'flat';

    public function label(): string
    {
        return match ($this) {
            self::PerMile => '¢/mile',
            self::PercentageOfGross => '% of gross',
            self::Flat => 'flat',
        };
    }

    /**
     * Calculate the expense amount given gross revenue and total miles.
     */
    public function calculate(float $rate, float $gross, float $miles): float
    {
        return round(match ($this) {
            self::PerMile => $miles * $rate,
            self::PercentageOfGross => $gross * $rate,
            self::Flat => $rate,
        }, 2);
    }
}
