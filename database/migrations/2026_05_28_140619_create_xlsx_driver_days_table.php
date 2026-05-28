<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('xlsx_driver_days', function (Blueprint $table) {
            $table->id();
            $table->foreignId('team_id')->constrained()->cascadeOnDelete();
            $table->date('work_date');
            // Raw driver string from the sheet (may include truck suffix, e.g. "Sergei GL1263").
            $table->string('driver_name');
            $table->string('truck_number')->nullable();
            $table->string('dispatcher')->nullable();
            $table->string('load_id')->nullable();
            $table->decimal('gross', 12, 2)->default(0);
            $table->decimal('miles', 12, 2)->default(0);
            // Idle markers like HOME / TRANSIT / REST when no gross/miles.
            $table->string('status')->nullable();
            // Source provenance — original sheet name + format + filename for auditing.
            $table->string('source_format', 32);
            $table->string('source_sheet')->nullable();
            $table->string('source_filename')->nullable();
            $table->timestamps();

            $table->index(['team_id', 'work_date']);
            $table->index(['team_id', 'driver_name']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('xlsx_driver_days');
    }
};
