<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Marks a configured expense as backed by real per-unit data. Null = no
     * actual source (stays a configured rate in both bases). See
     * App\Enums\ExpenseActualSource.
     */
    public function up(): void
    {
        Schema::table('team_expenses', function (Blueprint $table) {
            $table->string('actual_source', 16)->nullable()->after('calculation_type');
        });
    }

    public function down(): void
    {
        Schema::table('team_expenses', function (Blueprint $table) {
            $table->dropColumn('actual_source');
        });
    }
};
