<?php

namespace App\Ai\Tools;

use App\Models\TeamExpense;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

class ListExpenses extends AnalyticsTool implements Tool
{
    public function description(): Stringable|string
    {
        return "List the team's configured expenses with their calculation type (per-mile, % of gross, or flat), current rate, which contract types they apply to, and whether they're skipped for drivers with no gross. Use for questions about expenses, fees, or deductions.";
    }

    public function handle(Request $request): Stringable|string
    {
        $expenses = $this->team->expenses()->with('rates')->get()
            ->map(fn (TeamExpense $e) => [
                'name' => $e->name,
                'type' => $e->calculation_type->label(),
                'current_rate' => $e->currentRate(),
                'applies_to' => $e->applies_to ?? 'all contract types',
                'skip_when_no_gross' => $e->skip_when_no_gross,
            ])->values()->all();

        return $this->json([
            'team' => $this->team->name,
            'expense_count' => count($expenses),
            'expenses' => $expenses,
        ]);
    }

    public function schema(JsonSchema $schema): array
    {
        return [];
    }
}
