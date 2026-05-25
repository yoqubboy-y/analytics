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
        Schema::table('dashboard_shares', function (Blueprint $table) {
            // Null = whole dashboard; otherwise a subset of widget keys.
            $table->json('widgets')->nullable()->after('end_date');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('dashboard_shares', function (Blueprint $table) {
            $table->dropColumn('widgets');
        });
    }
};
