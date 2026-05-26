<?php

use App\Ai\Sql\AnalyticsQueryGuard;

test('it accepts a scoped read-only SELECT and strips a trailing semicolon', function () {
    $sql = 'SELECT count(*) FROM gross_boards WHERE company_id = :company_id;';

    expect(AnalyticsQueryGuard::sanitize($sql))
        ->toBe('SELECT count(*) FROM gross_boards WHERE company_id = :company_id');
});

test('it accepts a WITH … SELECT that scopes by company', function () {
    $sql = <<<'SQL'
    WITH d AS (
        SELECT dr.id FROM drivers dr
        JOIN company_users cu ON cu.user_id = dr.user_id AND cu.company_id = :company_id
    )
    SELECT * FROM d
    SQL;

    expect(AnalyticsQueryGuard::sanitize($sql))->toContain(':company_id');
});

test('it rejects queries that do not scope by company', function () {
    expect(fn () => AnalyticsQueryGuard::sanitize('SELECT * FROM drivers'))
        ->toThrow(InvalidArgumentException::class);
});

test('it rejects write and DDL statements', function (string $sql) {
    expect(fn () => AnalyticsQueryGuard::sanitize($sql))
        ->toThrow(InvalidArgumentException::class);
})->with([
    'insert' => ['INSERT INTO drivers (id) VALUES (1) WHERE company_id = :company_id'],
    'update' => ['UPDATE drivers SET name = ? WHERE company_id = :company_id'],
    'delete' => ['DELETE FROM drivers WHERE company_id = :company_id'],
    'drop' => ['DROP TABLE drivers WHERE :company_id'],
    'truncate' => ['TRUNCATE drivers WHERE :company_id'],
    'data-modifying cte' => ['WITH x AS (DELETE FROM drivers RETURNING id) SELECT * FROM x WHERE :company_id'],
    'copy' => ['COPY drivers TO STDOUT WHERE :company_id'],
    'function side-effect' => ['SELECT pg_sleep(10) WHERE :company_id = :company_id'],
]);

test('it rejects multiple statements', function () {
    $sql = 'SELECT 1 WHERE :company_id = :company_id; SELECT 2';

    expect(fn () => AnalyticsQueryGuard::sanitize($sql))
        ->toThrow(InvalidArgumentException::class);
});

test('it rejects comments', function (string $sql) {
    expect(fn () => AnalyticsQueryGuard::sanitize($sql))
        ->toThrow(InvalidArgumentException::class);
})->with([
    'line comment' => ['SELECT * FROM drivers -- :company_id'],
    'block comment' => ['SELECT * /* :company_id */ FROM drivers WHERE company_id = :company_id'],
]);

test('it rejects non-SELECT statements', function () {
    expect(fn () => AnalyticsQueryGuard::sanitize('EXPLAIN SELECT 1 WHERE :company_id = :company_id'))
        ->toThrow(InvalidArgumentException::class);
});

test('it rejects literal bind markers', function () {
    expect(fn () => AnalyticsQueryGuard::sanitize('SELECT * FROM drivers WHERE id = ? AND company_id = :company_id'))
        ->toThrow(InvalidArgumentException::class);
});

test('it rejects row-locking clauses', function () {
    expect(fn () => AnalyticsQueryGuard::sanitize('SELECT * FROM drivers WHERE company_id = :company_id FOR UPDATE'))
        ->toThrow(InvalidArgumentException::class);
});
