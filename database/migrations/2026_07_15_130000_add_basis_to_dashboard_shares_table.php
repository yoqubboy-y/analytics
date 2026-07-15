<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Which expense basis (kpi|actual) the share was created on, so the public
     * view reproduces what the sharer saw. Defaults to kpi for existing shares.
     */
    public function up(): void
    {
        Schema::table('dashboard_shares', function (Blueprint $table) {
            $table->string('basis', 8)->default('kpi')->after('end_date');
        });
    }

    public function down(): void
    {
        Schema::table('dashboard_shares', function (Blueprint $table) {
            $table->dropColumn('basis');
        });
    }
};
