<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Real fuel / toll / fleet-maintenance transactions, keyed by unit + ISO
     * week. Fleet-wide (keyed by unit, not team). Raw rows are stored for
     * auditability; the lookup service sums by (source, unit, week_start).
     * `week_start` is the Monday of the file's pay period (Mon→Sun aligns 1:1
     * with the report's ISO-week buckets).
     */
    public function up(): void
    {
        Schema::create('expense_actuals', function (Blueprint $table) {
            $table->id();
            $table->string('company')->nullable();
            // 'fuel' | 'toll' | 'fleet' — see App\Enums\ExpenseActualSource.
            $table->string('source', 16);
            $table->string('unit');
            $table->date('week_start');
            $table->decimal('amount', 12, 2);
            // Fuel category (ULSD/DEF/scale) or fleet work-order type.
            $table->string('category')->nullable();
            // Provenance: the driver named on the transaction and its own date.
            $table->string('driver_name')->nullable();
            $table->date('txn_date')->nullable();
            $table->string('source_filename')->nullable();
            $table->timestamps();

            $table->index(['source', 'unit', 'week_start']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('expense_actuals');
    }
};
