<?php

namespace App\Ai\Tools;

use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Contracts\Tool;
use Laravel\Ai\Tools\Request;
use Stringable;

/**
 * Lets the assistant render a live shadcn/ui component (chart, table, cards,
 * KPI stats, …) in the chat instead of describing it in text.
 *
 * The `jsx` argument is rendered client-side by the JSXPreview element against
 * a fixed whitelist of components (see resources/js/components/ai/ui-preview.tsx),
 * so no arbitrary code runs — only the allowed components are instantiated.
 */
class RenderUi implements Tool
{
    /**
     * Tool name exposed to the model (and used as the `tool-render_ui` UI part).
     */
    public function name(): string
    {
        return 'render_ui';
    }

    public function description(): Stringable|string
    {
        return <<<'TXT'
        Render a visual UI component for the user from a JSX string. Use this whenever a chart, table, comparison, or KPI summary communicates the answer better than plain text — for example after fetching numbers with the data tools. Never draw ASCII/text charts; call this instead.

        The `jsx` must use ONLY these whitelisted components (plus plain HTML like div, p, span, h2–h4, ul/li and Tailwind className):
        - Layout/content: Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Separator, Badge, Alert, AlertTitle, AlertDescription.
        - Stat: Stat (props: label, value, hint?, trend? "up"|"down").
        - Tables: Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableCaption.
        - Charts: BarChart, LineChart, PieChart — each takes data={[{ label: string, value: number }, …]} and optional title, unit ("$", "%", "mi"), and horizontal (BarChart only, boolean).
        - Maps: RouteMap — draws freight lanes on a real map. Takes routes={[{ from, to, kind?: "win"|"lose", label?, rpm? }, …]} where `from`/`to` are 2-letter US state codes (e.g. "CA", "TX", "PA"). Use this for any route/lane question instead of listing routes as text — e.g. winning lanes as kind:"win" (green) and losing lanes as kind:"lose" (red).

        Rules: self-contained markup only — no imports, no <script>, no event handlers, no JavaScript logic or function children, no external images. Put real numbers from the tools directly into the JSX. Keep it compact. After rendering, add at most a one-line text note; do not repeat the data as a text table.
        TXT;
    }

    public function handle(Request $request): Stringable|string
    {
        // The JSX lives in the tool arguments and is rendered by the client; we
        // only acknowledge so the model can add a short closing note.
        return json_encode(
            ['rendered' => (bool) ($request['jsx'] ?? false)],
            JSON_THROW_ON_ERROR,
        );
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'jsx' => $schema->string()
                ->description('A self-contained JSX string using only the whitelisted components and plain HTML. Example: <Card><CardHeader><CardTitle>Net P&L</CardTitle></CardHeader><CardContent><BarChart unit="$" data={[{label:"Dustin",value:37517},{label:"Tommy",value:20769}]} /></CardContent></Card>')
                ->required(),
            'title' => $schema->string()
                ->description('Optional short title shown above the rendered UI.'),
        ];
    }
}
