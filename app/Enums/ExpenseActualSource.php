<?php

namespace App\Enums;

/**
 * Marks a configured team expense as backed by a real per-unit data source, so
 * `basis=actual` reports can swap its rate for the actual dollars keyed to the
 * driver's truck/trailer for the week. Expenses with no source stay a rate in
 * both bases (dispatch fee, factoring, insurance, …).
 */
enum ExpenseActualSource: string
{
    case TruckPayment = 'truck_payment';
    case TrailerPayment = 'trailer_payment';
    case Fuel = 'fuel';
    case Toll = 'toll';
    case Fleet = 'fleet';

    public function label(): string
    {
        return match ($this) {
            self::TruckPayment => 'Truck payment',
            self::TrailerPayment => 'Trailer payment',
            self::Fuel => 'Fuel',
            self::Toll => 'Toll',
            self::Fleet => 'Fleet maintenance',
        };
    }

    /**
     * Which resolved unit this source is charged against — truck-borne costs
     * use the driver's truck; the trailer payment uses their trailer. Fleet
     * (maintenance) spans both and sums them, so it is truck-anchored here.
     */
    public function assignmentKind(): DriverAssignmentKind
    {
        return match ($this) {
            self::TrailerPayment => DriverAssignmentKind::Trailer,
            default => DriverAssignmentKind::Truck,
        };
    }

    /**
     * True for the two static monthly "pool" sources stored in
     * `equipment_payments`; the rest are transaction ledgers in
     * `expense_actuals`.
     */
    public function isPayment(): bool
    {
        return $this === self::TruckPayment || $this === self::TrailerPayment;
    }
}
