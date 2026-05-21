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
            $table->boolean('skip_when_no_gross')->default(false)->after('applies_to');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('team_expenses', function (Blueprint $table) {
            $table->dropColumn('skip_when_no_gross');
        });
    }
};
