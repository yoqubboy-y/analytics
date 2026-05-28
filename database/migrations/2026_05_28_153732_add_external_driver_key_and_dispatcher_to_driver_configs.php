<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // The existing UNIQUE(team_id, external_driver_id) prevents making
        // the column nullable cleanly, so drop & re-add it after.
        Schema::table('driver_configs', function (Blueprint $table) {
            $table->dropUnique(['team_id', 'external_driver_id']);
        });

        Schema::table('driver_configs', function (Blueprint $table) {
            $table->unsignedBigInteger('external_driver_id')->nullable()->change();
            // Identity used by XLSX-backed teams (lower(name)|TRUCK).
            $table->string('external_driver_key')->nullable()->after('external_driver_id');
            // Manual dispatcher override, applied to every aggregated row.
            $table->string('dispatcher')->nullable()->after('contract_type');

            $table->unique(['team_id', 'external_driver_id'], 'driver_configs_team_external_id_unique');
            $table->unique(['team_id', 'external_driver_key'], 'driver_configs_team_external_key_unique');
        });
    }

    public function down(): void
    {
        Schema::table('driver_configs', function (Blueprint $table) {
            $table->dropUnique('driver_configs_team_external_id_unique');
            $table->dropUnique('driver_configs_team_external_key_unique');
            $table->dropColumn(['external_driver_key', 'dispatcher']);
            $table->unsignedBigInteger('external_driver_id')->nullable(false)->change();
            $table->unique(['team_id', 'external_driver_id']);
        });
    }
};
