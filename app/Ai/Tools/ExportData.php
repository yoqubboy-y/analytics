<?php

namespace App\Ai\Tools;

use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

/**
 * Offers the user a downloadable SPREADSHEET (Excel / CSV) of a table the
 * assistant has assembled. For tabular data only — written reports go through
 * export_report (PDF / Word). The file is built client-side from the columns
 * and rows passed here (resources/js/lib/exporters.ts); nothing is written
 * server-side and the rows render in the chat's artifact panel.
 */
class ExportData implements Tool
{
    private const FORMATS = ['xlsx', 'csv'];

    public function name(): string
    {
        return 'export_data';
    }

    public function description(): Stringable|string
    {
        return <<<'TXT'
        Offer the user a downloadable SPREADSHEET of tabular results — rows and columns of numbers/values (a P&L table, dispatcher rankings, a driver list, etc.). Use this for data, NOT for written reports (use export_report for those).

        Pass `columns` (header labels) and `rows` (each row an array of cell values in column order) using real numbers from the data tools. Optionally set `title`, `filename` (no extension), and `formats` — a subset of: xlsx, csv. Default to xlsx (csv only if the user wants raw/interchange data). Do NOT offer PDF or Word here. This opens an artifact panel with the table and download buttons; don't also paste the full table as text.
        TXT;
    }

    public function handle(Request $request): Stringable|string
    {
        $formats = is_array($request['formats'] ?? null)
            ? array_values(array_intersect(self::FORMATS, $request['formats']))
            : [];

        return json_encode([
            'exported' => true,
            'formats' => $formats === [] ? self::FORMATS : $formats,
        ], JSON_THROW_ON_ERROR);
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'columns' => $schema->array()->items($schema->string())
                ->description('Column header labels, in order.')
                ->required(),
            'rows' => $schema->array()
                ->description('Row data: an array of rows, each an array of cell values (string or number) in the same order as columns.')
                ->required(),
            'title' => $schema->string()
                ->description('Optional title shown above the export and used in the file.'),
            'filename' => $schema->string()
                ->description('Optional base filename, no extension (e.g. "dispatcher-pnl").'),
            'formats' => $schema->array()->items($schema->string())
                ->description('Optional subset of: xlsx, csv. Defaults to both; prefer xlsx for row data.'),
        ];
    }
}
