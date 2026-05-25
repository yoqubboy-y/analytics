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
        Schema::table('driver_config_rates', function (Blueprint $table) {
            // Null = open-ended (in force until a later rate supersedes it).
            $table->date('effective_to')->nullable()->after('effective_from');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('driver_config_rates', function (Blueprint $table) {
            $table->dropColumn('effective_to');
        });
    }
};
