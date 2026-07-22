<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Flags an expense as manually attributed: in Actual basis its per-driver
     * dollars come from `expense_attributions`, not the unit-matched ledger or
     * the configured rate. Default false — no behaviour change until flipped.
     */
    public function up(): void
    {
        Schema::table('team_expenses', function (Blueprint $table) {
            $table->boolean('is_manual')->default(false)->after('actual_source');
        });
    }

    public function down(): void
    {
        Schema::table('team_expenses', function (Blueprint $table) {
            $table->dropColumn('is_manual');
        });
    }
};
