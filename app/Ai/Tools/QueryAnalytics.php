<?php

namespace App\Ai\Tools;

use App\Ai\Sql\AnalyticsQueryGuard;
use Illuminate\Contracts\JsonSchema\JsonSchema;
use InvalidArgumentException;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;
use Throwable;

/**
 * Runs an assistant-authored, read-only SQL SELECT against the analytics
 * database — scoped to the caller's company and validated by
 * App\Ai\Sql\AnalyticsQueryGuard. For ad-hoc questions that the structured
 * tools (PnL, key metrics, …) don't cover.
 */
class QueryAnalytics extends AnalyticsTool implements Tool
{
    public function name(): string
    {
        return 'query_analytics';
    }

    public function description(): Stringable|string
    {
        return <<<'TXT'
        Run ONE read-only SQL SELECT against the analytics database for ad-hoc questions that the other tools don't answer (e.g. drilling into how a specific dispatcher's drivers earned, across multiple tables). Call describe_schema first for tables, columns and scoping.

        Hard rules:
        - Read-only: a single SELECT or WITH … SELECT. No INSERT/UPDATE/DELETE/DDL, no semicolons, no comments. Writes are impossible and will error.
        - ALWAYS scope to the current company with the :company_id placeholder — it is bound to the logged-in team automatically. Never write a literal company id, and never query another company. Use the join described by describe_schema (usually company_users.company_id = :company_id, or gross_boards.company_id = :company_id).
        - Results are capped at 200 rows. Aggregate/limit in SQL when you expect many rows.
        - If the query errors, read the message, fix the SQL (often a column name), and try again.
        TXT;
    }

    public function handle(Request $request): Stringable|string
    {
        $sql = is_string($request['sql'] ?? null) ? $request['sql'] : '';

        try {
            $rows = AnalyticsQueryGuard::run($sql, $this->team->external_company_id);
        } catch (InvalidArgumentException $e) {
            return $this->json(['error' => $e->getMessage()]);
        } catch (Throwable $e) {
            return $this->json(['error' => 'Query failed: '.$e->getMessage()]);
        }

        return $this->json([
            'row_count' => count($rows),
            'truncated' => count($rows) >= AnalyticsQueryGuard::MAX_ROWS,
            'rows' => $rows,
        ]);
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'sql' => $schema->string()
                ->description('A single read-only PostgreSQL SELECT (or WITH … SELECT). Must reference the :company_id placeholder to scope to the current company. No writes, semicolons, or comments.')
                ->required(),
        ];
    }
}
