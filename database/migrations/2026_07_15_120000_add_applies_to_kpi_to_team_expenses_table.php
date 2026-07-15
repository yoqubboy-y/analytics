<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Whether this expense is included in the KPI (basis=kpi) P&L. Mirrors
     * applies_to_actual: uncheck it to make an expense Actual-only (included in
     * the factual figure but hidden from the averaged KPI view). Defaults to
     * true so every existing expense keeps showing in KPI.
     */
    public function up(): void
    {
        Schema::table('team_expenses', function (Blueprint $table) {
            $table->boolean('applies_to_kpi')->default(true)->after('applies_to_actual');
        });
    }

    public function down(): void
    {
        Schema::table('team_expenses', function (Blueprint $table) {
            $table->dropColumn('applies_to_kpi');
        });
    }
};
