<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Point the five actual-backed expenses at their data source by exact name.
     * Runs across every team; teams without a given expense are unaffected.
     */
    public function up(): void
    {
        $map = [
            'Truck Payment' => 'truck_payment',
            'Trailer Payment' => 'trailer_payment',
            'Fuel' => 'fuel',
            'Toll' => 'toll',
            'Fleet Maintenance' => 'fleet',
        ];

        foreach ($map as $name => $source) {
            DB::table('team_expenses')
                ->where('name', $name)
                ->update(['actual_source' => $source]);
        }
    }

    public function down(): void
    {
        DB::table('team_expenses')->update(['actual_source' => null]);
    }
};
