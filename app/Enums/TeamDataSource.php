<?php

namespace App\Enums;

enum TeamDataSource: string
{
    case AnalyticsDb = 'analytics_db';
    case Xlsx = 'xlsx';

    public function label(): string
    {
        return match ($this) {
            self::AnalyticsDb => 'Analytics database',
            self::Xlsx => 'XLSX upload',
        };
    }
}
