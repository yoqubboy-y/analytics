<?php

namespace App\Ai\Tools;

use App\Models\Team;
use App\Services\AnalyticsService;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\JsonSchema\Types\Type;
use Laravel\Ai\Tools\Request;

/**
 * Base class for the read-only analytics tools. Every tool is scoped to a
 * single team and shares date-window resolution with AnalyticsController.
 */
abstract class AnalyticsTool
{
    public function __construct(protected Team $team) {}

    protected function analytics(): AnalyticsService
    {
        return app(AnalyticsService::class);
    }

    /**
     * Resolve the reporting window, defaulting to the current week and
     * applying the same swap/clamp rules as the dashboard.
     *
     * @return array{0: CarbonImmutable, 1: CarbonImmutable}
     */
    protected function resolveWindow(Request $request): array
    {
        $start = ($request['start_date'] ?? null)
            ? CarbonImmutable::parse($request['start_date'])
            : CarbonImmutable::now()->startOfWeek();

        $end = ($request['end_date'] ?? null)
            ? CarbonImmutable::parse($request['end_date'])
            : CarbonImmutable::now()->endOfWeek();

        if ($start->greaterThan($end)) {
            [$start, $end] = [$end, $start];
        }

        if ((int) $start->diffInDays($end) > 366) {
            $end = $start->addDays(366);
        }

        return [$start, $end];
    }

    /**
     * Optional start/end date parameters shared by the window-based tools.
     *
     * @return array<string, Type>
     */
    protected function windowSchema(JsonSchema $schema): array
    {
        return [
            'start_date' => $schema->string()
                ->description("Start date as YYYY-MM-DD. Optional; defaults to the current week's Monday. Reports run on whole Monday–Sunday weeks."),
            'end_date' => $schema->string()
                ->description("End date as YYYY-MM-DD. Optional; defaults to the current week's Sunday."),
        ];
    }

    /**
     * Encode a tool result as compact JSON for the model.
     */
    protected function json(array $data): string
    {
        return json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
    }
}
