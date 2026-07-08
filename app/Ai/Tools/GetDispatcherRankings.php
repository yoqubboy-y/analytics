<?php

namespace App\Ai\Tools;

use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Support\Collection;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

class GetDispatcherRankings extends AnalyticsTool implements Tool
{
    public function description(): Stringable|string
    {
        return 'Rank dispatchers by performance over a date range: total net P&L, total gross, RPM, truck count, and weekly averages per truck. Use for questions like "top dispatchers" or comparing dispatcher performance.';
    }

    public function handle(Request $request): Stringable|string
    {
        [$start, $end] = $this->resolveWindow($request);

        $weeks = max(1, ((int) $start->diffInDays($end) + 1) / 7);

        // Dispatcher-split rows attribute each ISO week's gross/net to the
        // dispatcher who actually ran it, so a driver who changed dispatcher
        // mid-range no longer dumps their whole total on one of them.
        $rows = $this->analytics()->dispatcherRows($this->team, $start, $end)
            ->where('missing_config', false);

        $ranked = $rows
            ->groupBy(fn (array $r) => $r['dispatcher'] ?: 'Unassigned')
            ->map(function (Collection $group, string $dispatcher) use ($weeks) {
                $gross = (float) $group->sum('total_gross');
                $miles = (float) $group->sum('total_miles');
                $net = (float) $group->sum('profit_loss');
                $trucks = $group->pluck('truck_number')->filter()->unique()->count()
                    ?: $group->pluck('driver_id')->filter()->unique()->count();
                $trucks = max($trucks, 1);

                return [
                    'dispatcher' => $dispatcher,
                    'trucks' => $trucks,
                    'total_net' => round($net, 2),
                    'total_gross' => round($gross, 2),
                    'rpm' => $miles > 0 ? round($gross / $miles, 2) : 0.0,
                    'avg_net_per_truck_per_week' => round($net / $trucks / $weeks, 2),
                    'avg_gross_per_truck_per_week' => round($gross / $trucks / $weeks, 2),
                ];
            })
            ->sortByDesc('total_net')
            ->values()
            ->all();

        return $this->json([
            'team' => $this->team->name,
            'period' => ['start' => $start->toDateString(), 'end' => $end->toDateString()],
            'weeks' => round($weeks, 2),
            'dispatchers' => $ranked,
        ]);
    }

    public function schema(JsonSchema $schema): array
    {
        return $this->windowSchema($schema);
    }
}
