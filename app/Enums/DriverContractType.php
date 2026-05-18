<?php

namespace App\Enums;

enum DriverContractType: string
{
    case CompanyCpm = 'company_cpm';
    case CompanyPercentage = 'company_percentage';
    case LeaseOperator = 'lease_operator';
    case LeaseOwner = 'lease_owner';
    case OwnerOperator = 'owner_operator';

    /**
     * Whether this contract type receives a fuel charge deduction.
     */
    public function hasFuelCharge(): bool
    {
        return match ($this) {
            self::LeaseOperator, self::LeaseOwner, self::OwnerOperator => false,
            default => true,
        };
    }

    /**
     * Whether this contract type receives a misc per-mile deduction.
     */
    public function hasMiscCharge(): bool
    {
        return $this->hasFuelCharge();
    }

    /**
     * Display label for this contract type.
     */
    public function label(): string
    {
        return match ($this) {
            self::CompanyCpm => 'C',
            self::CompanyPercentage => 'C%',
            self::LeaseOperator => 'L',
            self::LeaseOwner => 'L/O',
            self::OwnerOperator => 'O',
        };
    }
}
