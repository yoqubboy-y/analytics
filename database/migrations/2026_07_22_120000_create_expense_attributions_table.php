<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Manual per-driver expense attributions: for a `manual` expense, the
     * Actual-basis dollars come entirely from these hand-entered rows — one
     * per (expense, driver config, ISO week) — instead of unit-matched ledger
     * data. `paid_by` mirrors the driver-paid/company-paid split (company =
     * carrier cost, driver = negative pass-through).
     */
    public function up(): void
    {
        Schema::create('expense_attributions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('team_expense_id')->constrained()->cascadeOnDelete();
            $table->foreignId('driver_config_id')->constrained()->cascadeOnDelete();
            $table->date('week_start');
            $table->decimal('amount', 12, 2);
            $table->string('paid_by', 8)->default('company');
            $table->text('note')->nullable();
            $table->timestamps();

            $table->index(['team_expense_id', 'week_start']);
            $table->index(['driver_config_id', 'week_start']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('expense_attributions');
    }
};
