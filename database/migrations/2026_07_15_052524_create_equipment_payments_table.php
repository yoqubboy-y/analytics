<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Static monthly truck / trailer payments, keyed by unit number. Fleet-wide
     * (a unit isn't team-specific — whoever drives it that week bears its cost),
     * so scoped by an optional `company` provenance string rather than team_id.
     * Effective-dated like `driver_config_rates` so a payment change is a new
     * row, resolved by the effective date of the week being priced.
     */
    public function up(): void
    {
        Schema::create('equipment_payments', function (Blueprint $table) {
            $table->id();
            $table->string('company')->nullable();
            // 'truck' | 'trailer' — see App\Enums\ExpenseActualSource / DriverAssignmentKind.
            $table->string('kind', 16);
            $table->string('unit');
            $table->decimal('monthly_amount', 12, 2);
            $table->date('effective_from');
            $table->date('effective_to')->nullable();
            $table->timestamps();

            $table->index(['kind', 'unit', 'effective_from']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('equipment_payments');
    }
};
