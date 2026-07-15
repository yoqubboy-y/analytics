<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Whether this expense is included in the Actual (basis=actual) P&L. The
     * five actual-backed expenses always carry their real dollars; every other
     * expense (factoring %, insurance, dispatch, …) is included at its
     * configured rate only when this is true, so management can curate which
     * estimates belong in the actual figure. Defaults to true to preserve the
     * current behavior (everything included) until an expense is unchecked.
     */
    public function up(): void
    {
        Schema::table('team_expenses', function (Blueprint $table) {
            $table->boolean('applies_to_actual')->default(true)->after('actual_source');
        });
    }

    public function down(): void
    {
        Schema::table('team_expenses', function (Blueprint $table) {
            $table->dropColumn('applies_to_actual');
        });
    }
};
