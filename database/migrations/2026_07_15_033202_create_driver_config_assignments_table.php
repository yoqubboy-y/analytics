<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Time-versioned truck / trailer / dispatcher assignments for a driver
     * config, mirroring `driver_config_rates`. Each `kind` is an independent
     * history resolved by effective date: which unit/dispatcher a driver was
     * on in a given week. Applies to XLSX-backed teams — analytics-DB teams
     * get these straight from the TMS.
     */
    public function up(): void
    {
        Schema::create('driver_config_assignments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('driver_config_id')->constrained()->cascadeOnDelete();
            // 'truck' | 'trailer' | 'dispatcher' — see App\Enums\DriverAssignmentKind.
            $table->string('kind', 16);
            // The unit number (GL7005, T6330) or dispatcher name.
            $table->string('value');
            // In force from this date until a later assignment of the same kind
            // supersedes it. Null effective_to = open-ended.
            $table->date('effective_from');
            $table->date('effective_to')->nullable();
            $table->timestamps();

            $table->index(['driver_config_id', 'kind', 'effective_from']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('driver_config_assignments');
    }
};
