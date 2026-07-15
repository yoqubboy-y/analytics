<?php

namespace App\Enums;

/**
 * The kinds of time-versioned assignment a driver config can carry, alongside
 * its tariff rate history. Each kind is an independent history: a driver's
 * truck can change on a different date than their trailer or dispatcher.
 */
enum DriverAssignmentKind: string
{
    case Truck = 'truck';
    case Trailer = 'trailer';
    case Dispatcher = 'dispatcher';

    public function label(): string
    {
        return match ($this) {
            self::Truck => 'Truck',
            self::Trailer => 'Trailer',
            self::Dispatcher => 'Dispatcher',
        };
    }
}
