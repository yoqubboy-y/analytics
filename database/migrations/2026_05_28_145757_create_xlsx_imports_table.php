<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('xlsx_imports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('team_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('source_format', 32);
            $table->string('source_filename')->nullable();
            $table->unsignedSmallInteger('total_sheets')->default(0);
            $table->unsignedInteger('total_rows')->default(0);
            // Lifecycle: queued -> processing -> completed | failed.
            $table->string('status', 16)->default('queued');
            $table->text('error_message')->nullable();
            // Filesystem path (storage disk: local) where the parsed JSON
            // payload was staged for the worker. Removed on success.
            $table->string('payload_path')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();

            $table->index(['team_id', 'created_at']);
            $table->index(['status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('xlsx_imports');
    }
};
