<?php

namespace App\Ai\Sql;

use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * Validates and safely executes assistant-generated SQL against the external
 * analytics database.
 *
 * Defense in depth, in order:
 *   1. sanitize(): only a single read-only SELECT/WITH statement is allowed —
 *      no writes/DDL, no comments, no statement chaining, and the query MUST
 *      reference the bound :company_id placeholder so results stay scoped to
 *      the caller's team.
 *   2. run(): the (server-controlled) company id is bound positionally — never
 *      string-concatenated — and the query runs inside a Postgres READ ONLY
 *      transaction with a statement timeout and a hard row cap, then rolled
 *      back. Writes are impossible at the session level even if validation is
 *      somehow bypassed.
 *
 * NOTE: this is app-level protection. For a hard guarantee, point
 * TARGET_ANALYTICS_DB_URL at a Postgres role with SELECT-only privileges.
 */
class AnalyticsQueryGuard
{
    public const MAX_ROWS = 200;

    public const TIMEOUT = '6s';

    private const PLACEHOLDER = ':company_id';

    /**
     * Data-modifying / dangerous tokens rejected outright (the read-only
     * transaction is the backstop; this catches data-modifying CTEs and
     * side-effecting functions before they ever run).
     */
    private const DENYLIST = [
        'insert', 'update', 'delete', 'merge', 'upsert', 'drop', 'alter',
        'truncate', 'create', 'grant', 'revoke', 'copy', 'vacuum', 'reindex',
        'refresh', 'into', 'returning', 'pg_sleep', 'pg_read_file', 'pg_ls_dir',
        'lo_import', 'lo_export', 'lo_unlink', 'dblink', 'set_config',
        'pg_terminate_backend', 'pg_cancel_backend',
    ];

    /**
     * Validate the query, returning the cleaned SQL (without trailing `;`).
     *
     * @throws InvalidArgumentException when the query is not a safe, scoped read.
     */
    public static function sanitize(string $sql): string
    {
        $sql = trim($sql);

        if (str_ends_with($sql, ';')) {
            $sql = rtrim(substr($sql, 0, -1));
        }

        if ($sql === '') {
            throw new InvalidArgumentException('The query is empty.');
        }

        if (mb_strlen($sql) > 6000) {
            throw new InvalidArgumentException('The query is too long.');
        }

        if (str_contains($sql, ';')) {
            throw new InvalidArgumentException('Only a single statement is allowed (no ";").');
        }

        if (preg_match('#--|/\*|\*/|\##', $sql)) {
            throw new InvalidArgumentException('Comments are not allowed in the query.');
        }

        if (str_contains($sql, '?')) {
            throw new InvalidArgumentException('Use the :company_id placeholder, not "?".');
        }

        if (! preg_match('/^\s*(with|select)\s/i', $sql)) {
            throw new InvalidArgumentException('Only read-only SELECT (or WITH … SELECT) queries are allowed.');
        }

        foreach (self::DENYLIST as $keyword) {
            if (preg_match('/\b'.preg_quote($keyword, '/').'\b/i', $sql)) {
                throw new InvalidArgumentException("Disallowed keyword in query: [{$keyword}]. Queries must be read-only.");
            }
        }

        if (preg_match('/\bfor\s+(update|share|no\s+key\s+update|key\s+share)\b/i', $sql)) {
            throw new InvalidArgumentException('Row-locking clauses (FOR UPDATE/SHARE) are not allowed.');
        }

        if (! str_contains($sql, self::PLACEHOLDER)) {
            throw new InvalidArgumentException('The query must scope results to the current company using the :company_id placeholder.');
        }

        return $sql;
    }

    /**
     * Run a sanitized query, scoped to the given company, read-only.
     *
     * @return array<int, array<string, mixed>>
     *
     * @throws InvalidArgumentException
     */
    public static function run(string $sql, int|string $companyId): array
    {
        $clean = self::sanitize($sql);

        // Bind the company id positionally, once per placeholder occurrence —
        // never concatenated, so the value can't break out of its parameter.
        $occurrences = substr_count($clean, self::PLACEHOLDER);
        $prepared = str_replace(self::PLACEHOLDER, '?', $clean);
        $bindings = array_fill(0, $occurrences, $companyId);

        $wrapped = "SELECT * FROM ({$prepared}) AS _ai_q LIMIT ".self::MAX_ROWS;

        $connection = DB::connection('analytics');

        $connection->beginTransaction();

        try {
            $connection->statement('SET TRANSACTION READ ONLY');
            $connection->statement("SET LOCAL statement_timeout = '".self::TIMEOUT."'");

            $rows = $connection->select($wrapped, $bindings);
        } finally {
            $connection->rollBack();
        }

        return array_map(fn ($row): array => (array) $row, $rows);
    }
}
