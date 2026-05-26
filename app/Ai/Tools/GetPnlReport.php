<?php

namespace App\Ai\Tools;

use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

class GetPnlReport extends AnalyticsTool implements Tool
{
    public function description(): Stringable|string
    {
        return 'Get the weekly profit & loss report for the team over a date range: per-driver gross, miles, RPM, salary, total expenses and net P&L, plus the team totals. Use for questions about profit, revenue, miles, pay, or specific drivers.';
    }

    public function handle(Request $request): Stringable|string
    {
        [$start, $end] = $this->resolveWindow($request);

        $rows = $this->analytics()->weeklyReport($this->team, $start, $end);
        $total = $rows->firstWhere('is_total', true);

        $drivers = $rows->where('is_total', false)->map(fn (array $r) => [
            'driver' => $r['driver_name'],
            'dispatcher' => $r['dispatcher'],
            'truck' => $r['truck_number'],
            'type' => $r['type'],
            'days' => $r['days'],
            'gross' => $r['total_gross'],
            'miles' => $r['total_miles'],
            'rpm' => $r['rpm'],
            'salary' => $r['salary'],
            'expenses_total' => $r['total_expenses'],
            'profit_loss' => $r['profit_loss'],
            'missing_config' => $r['missing_config'],
        ])->values()->all();

        return $this->json([
            'team' => $this->team->name,
            'period' => ['start' => $start->toDateString(), 'end' => $end->toDateString()],
            'totals' => $total ? [
                'gross' => $total['total_gross'],
                'miles' => $total['total_miles'],
                'rpm' => $total['rpm'],
                'salary' => $total['salary'],
                'expenses_total' => $total['total_expenses'],
                'profit_loss' => $total['profit_loss'],
            ] : null,
            'driver_count' => count($drivers),
            'drivers' => $drivers,
        ]);
    }

    public function schema(JsonSchema $schema): array
    {
        return $this->windowSchema($schema);
    }
}
