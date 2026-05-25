<?php

use Carbon\Carbon;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('driver_config_rates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('driver_config_id')->constrained()->cascadeOnDelete();
            // CPM drivers: dollars/mile (e.g. 0.65). Percentage drivers: decimal (e.g. 0.30).
            $table->decimal('tariff_rate', 5, 4);
            // The tariff is in force from this date until the next rate supersedes it.
            $table->date('effective_from');
            $table->timestamps();

            $table->index(['driver_config_id', 'effective_from']);
        });

        // Backfill one rate row per existing driver config, using the current
        // tariff, effective from the date the config was created.
        $now = now();

        foreach (DB::table('driver_configs')->get(['id', 'tariff_rate', 'created_at']) as $config) {
            DB::table('driver_config_rates')->insert([
                'driver_config_id' => $config->id,
                'tariff_rate' => $config->tariff_rate,
                'effective_from' => $config->created_at
                    ? Carbon::parse($config->created_at)->toDateString()
                    : '1970-01-01',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        Schema::table('driver_configs', function (Blueprint $table) {
            $table->dropColumn('tariff_rate');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('driver_configs', function (Blueprint $table) {
            $table->decimal('tariff_rate', 5, 4)->default(0)->after('contract_type');
        });

        // Restore each config's most recent tariff onto the parent column.
        $seen = [];

        $rates = DB::table('driver_config_rates')
            ->orderBy('driver_config_id')
            ->orderByDesc('effective_from')
            ->orderByDesc('id')
            ->get(['driver_config_id', 'tariff_rate']);

        foreach ($rates as $rate) {
            if (isset($seen[$rate->driver_config_id])) {
                continue;
            }

            $seen[$rate->driver_config_id] = true;

            DB::table('driver_configs')
                ->where('id', $rate->driver_config_id)
                ->update(['tariff_rate' => $rate->tariff_rate]);
        }

        Schema::dropIfExists('driver_config_rates');
    }
};
