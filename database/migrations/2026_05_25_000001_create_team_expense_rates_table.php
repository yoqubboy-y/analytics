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
        Schema::create('team_expense_rates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('team_expense_id')->constrained()->cascadeOnDelete();
            $table->decimal('rate', 10, 4);
            // The rate is in force from this date until the next rate supersedes it.
            $table->date('effective_from');
            $table->timestamps();

            $table->index(['team_expense_id', 'effective_from']);
        });

        // Backfill one rate row per existing expense, using the current rate,
        // effective from the date the expense was created. The resolution rule
        // falls back to the earliest rate, so older reports keep resolving.
        $now = now();

        foreach (DB::table('team_expenses')->get(['id', 'rate', 'created_at']) as $expense) {
            DB::table('team_expense_rates')->insert([
                'team_expense_id' => $expense->id,
                'rate' => $expense->rate,
                'effective_from' => $expense->created_at
                    ? Carbon::parse($expense->created_at)->toDateString()
                    : '1970-01-01',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        Schema::table('team_expenses', function (Blueprint $table) {
            $table->dropColumn('rate');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('team_expenses', function (Blueprint $table) {
            $table->decimal('rate', 10, 4)->default(0)->after('calculation_type');
        });

        // Restore each expense's most recent rate onto the parent column.
        $seen = [];

        $rates = DB::table('team_expense_rates')
            ->orderBy('team_expense_id')
            ->orderByDesc('effective_from')
            ->orderByDesc('id')
            ->get(['team_expense_id', 'rate']);

        foreach ($rates as $rate) {
            if (isset($seen[$rate->team_expense_id])) {
                continue;
            }

            $seen[$rate->team_expense_id] = true;

            DB::table('team_expenses')
                ->where('id', $rate->team_expense_id)
                ->update(['rate' => $rate->rate]);
        }

        Schema::dropIfExists('team_expense_rates');
    }
};
