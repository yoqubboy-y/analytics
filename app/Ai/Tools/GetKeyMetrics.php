<?php

namespace App\Ai\Tools;

use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

class GetKeyMetrics extends AnalyticsTool implements Tool
{
    public function description(): Stringable|string
    {
        return 'Get high-level key metrics for the team over a date range: total drivers, compound utilization rate, and the per-status event-day breakdown. Use for questions about driver counts, utilization, or how driver time was spent.';
    }

    public function handle(Request $request): Stringable|string
    {
        [$start, $end] = $this->resolveWindow($request);

        $metrics = $this->analytics()->weeklyKeyMetrics($this->team, $start, $end);

        return $this->json([
            'team' => $this->team->name,
            'period' => ['start' => $start->toDateString(), 'end' => $end->toDateString()],
            'metrics' => $metrics,
        ]);
    }

    public function schema(JsonSchema $schema): array
    {
        return $this->windowSchema($schema);
    }
}
