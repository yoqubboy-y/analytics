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
        Schema::create('driver_configs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('team_id')->constrained()->cascadeOnDelete();
            // References drivers.id in the external analytics database
            $table->unsignedBigInteger('external_driver_id');
            $table->string('contract_type'); // DriverContractType enum value
            // CPM drivers: rate in dollars/mile (e.g. 0.65)
            // Percentage drivers: rate as decimal (e.g. 0.30 = 30%)
            $table->decimal('tariff_rate', 5, 4);
            $table->timestamps();

            $table->unique(['team_id', 'external_driver_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('driver_configs');
    }
};
