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
        Schema::table('team_expenses', function (Blueprint $table) {
            // Contract types whose drivers cover this expense themselves —
            // the carrier collects it out of the driver's salary share, so
            // it becomes income (the per-row cell is rendered negative
            // and `Gross − Total Exp. = P&L` keeps holding).
            $table->json('driver_paid_contract_types')->nullable()->after('applies_to');
        });
    }

    public function down(): void
    {
        Schema::table('team_expenses', function (Blueprint $table) {
            $table->dropColumn('driver_paid_contract_types');
        });
    }
};
