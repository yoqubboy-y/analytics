<?php

namespace App\Ai\Tools;

use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

/**
 * Offers the user a downloadable DOCUMENT (PDF / Word) of a written report —
 * prose plus optional markdown tables. For narrative reports/summaries; use
 * export_data instead for plain tabular data. The document is rendered
 * client-side from the markdown (resources/js/lib/exporters.ts) and shown in
 * the chat's artifact panel; nothing is written server-side.
 */
class ExportReport implements Tool
{
    private const FORMATS = ['pdf', 'docx'];

    public function name(): string
    {
        return 'export_report';
    }

    public function description(): Stringable|string
    {
        return <<<'TXT'
        Offer the user a downloadable DOCUMENT (PDF / Word) of a written report or summary — e.g. a "Management Report" with headings, prose analysis, and a few tables. Use this for narrative documents, NOT for plain tabular data (use export_data for that).

        Pass `markdown` as the full report body (use Markdown: # headings, paragraphs, bullet lists, and | pipe | tables | for any tabular sections) built from the real numbers you fetched, plus a `title`. Optionally set `filename` (no extension) and `formats` — a subset of: pdf, docx (defaults to both). Do NOT offer CSV or Excel here. This opens an artifact panel with the rendered report and download buttons; don't also repeat the whole report as a chat message.
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
            'title' => $schema->string()
                ->description('Report title (shown as the heading and used in the filename).')
                ->required(),
            'markdown' => $schema->string()
                ->description('The full report body in Markdown: headings, paragraphs, bullet lists, and pipe tables. Use real numbers from the data tools.')
                ->required(),
            'filename' => $schema->string()
                ->description('Optional base filename, no extension (e.g. "april-management-report").'),
            'formats' => $schema->array()->items($schema->string())
                ->description('Optional subset of: pdf, docx. Defaults to both.'),
        ];
    }
}
