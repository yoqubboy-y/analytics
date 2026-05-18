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
        Schema::create('team_expenses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('team_id')->constrained()->cascadeOnDelete();
            $table->string('name');                   // e.g. "20 Cent Fleet Rate", "Factoring Fee"
            $table->text('description')->nullable();
            $table->string('calculation_type');       // ExpenseCalculationType enum value
            $table->decimal('rate', 10, 4);           // 0.2000 for ¢/mile, 0.0100 for %, 132.00 for flat
            // Null = applies to all contract types. JSON array of DriverContractType values otherwise.
            $table->json('applies_to')->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('team_expenses');
    }
};
