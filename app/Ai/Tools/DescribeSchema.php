<?php

namespace App\Ai\Tools;

use Illuminate\Contracts\JsonSchema\JsonSchema;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

/**
 * Describes the read-only analytics schema so the assistant knows what columns
 * exist and how each table is scoped to a company before writing a query.
 *
 * Only an allow-listed set of tables is exposed.
 */
class DescribeSchema extends AnalyticsTool implements Tool
{
    /** Tables the assistant may query (mirrors AnalyticsService usage). */
    private const TABLES = [
        'gross_boards', 'week_boards', 'event_boards', 'drivers', 'dispatchers',
        'trucks', 'users', 'company_users', 'driver_days', 'event_only_drivers',
        'event_only_days',
    ];

    /** How each table is constrained to the current company. */
    private const SCOPE = [
        'gross_boards' => 'Has company_id directly — filter gross_boards.company_id = :company_id.',
        'company_users' => 'Bridge of users→companies. Filter company_users.company_id = :company_id AND is_deleted = false.',
        'drivers' => 'Scope via JOIN company_users cu ON cu.user_id = drivers.user_id AND cu.company_id = :company_id AND cu.is_deleted = false (and drivers.is_deleted = false).',
        'dispatchers' => 'Scope via JOIN company_users cu ON cu.user_id = dispatchers.user_id AND cu.company_id = :company_id AND cu.is_deleted = false.',
        'users' => 'Not company-specific on its own — reach it through company_users (cu.user_id = users.id AND cu.company_id = :company_id).',
        'trucks' => 'No direct company link — reach it through drivers (drivers.current_truck_id = trucks.id), which is company-scoped as above.',
        'week_boards' => 'Scope by joining to gross_boards/drivers that are company-scoped (e.g. via the driver), since it has no direct company_id.',
        'event_boards' => 'Scope by joining to company-scoped drivers (event_boards.primary_driver_id = drivers.id).',
        'driver_days' => 'Scope by joining to company-scoped drivers (driver_days.driver_id = drivers.id).',
        'event_only_drivers' => 'Scope by joining to company-scoped drivers (event_only_drivers.driver_id = drivers.id).',
        'event_only_days' => 'Scope by joining to company-scoped drivers (event_only_days.driver_id = drivers.id).',
    ];

    public function name(): string
    {
        return 'describe_schema';
    }

    public function description(): Stringable|string
    {
        return 'Describe the read-only analytics database: the queryable tables, their columns/types, and how each table is scoped to the current company. Call this before writing a query with query_analytics so you use real column names and scope correctly.';
    }

    public function handle(Request $request): Stringable|string
    {
        $columns = Cache::remember('ai.analytics.schema_columns', 3600, fn (): array => $this->introspect());

        $tables = collect(self::TABLES)->map(fn (string $table): array => [
            'table' => $table,
            'scope' => self::SCOPE[$table] ?? 'Scope to the current company via a join to a company-scoped table.',
            'columns' => $columns[$table] ?? [],
        ])->values()->all();

        return $this->json([
            'database' => 'analytics (read-only, PostgreSQL)',
            'note' => 'Every query must constrain results to the current company using the :company_id placeholder (bound automatically). Read-only; never attempt writes.',
            'tables' => $tables,
        ]);
    }

    public function schema(JsonSchema $schema): array
    {
        return [];
    }

    /**
     * Introspect column names/types for the allow-listed tables.
     *
     * @return array<string, array<int, array{name: string, type: string}>>
     */
    private function introspect(): array
    {
        $list = collect(self::TABLES)->map(fn (string $t): string => "'".$t."'")->implode(',');

        $rows = DB::connection('analytics')->select(
            "SELECT table_name, column_name, data_type
             FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name IN ({$list})
             ORDER BY table_name, ordinal_position"
        );

        $grouped = [];

        foreach ($rows as $row) {
            $grouped[$row->table_name][] = [
                'name' => $row->column_name,
                'type' => $row->data_type,
            ];
        }

        return $grouped;
    }
}
