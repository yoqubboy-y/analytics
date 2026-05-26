import { Maximize2Icon } from 'lucide-react';
import {
    Bar,
    BarChart as RBarChart,
    CartesianGrid,
    Cell,
    LabelList,
    Line,
    LineChart as RLineChart,
    Pie,
    PieChart as RPieChart,
    XAxis,
    YAxis,
} from 'recharts';
import { RouteMap } from '@/components/ai/route-map';
import {
    JSXPreview,
    JSXPreviewContent,
    JSXPreviewError,
} from '@/components/ai-elements/jsx-preview';
import {
    Alert,
    AlertDescription,
    AlertTitle,
} from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import { Separator } from '@/components/ui/separator';
import {
    Table,
    TableBody,
    TableCaption,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

type ChartDatum = { label?: string; name?: string; value: number };
type ChartProps = {
    data?: ChartDatum[];
    title?: string;
    unit?: string;
    horizontal?: boolean;
};

const CHART_COLORS = [
    'var(--chart-1)',
    'var(--chart-2)',
    'var(--chart-3)',
    'var(--chart-4)',
    'var(--chart-5)',
];

/** Compact value labels: $7k, $1.3M, 42%, 1,200 mi. */
function makeFormatter(unit?: string) {
    return (raw: unknown): string => {
        if (raw == null) {
            return '';
        }

        const value = Number(raw);

        if (!Number.isFinite(value)) {
            return String(raw);
        }

        if (unit === '$') {
            const sign = value < 0 ? '-' : '';
            const abs = Math.abs(value);

            if (abs >= 1_000_000) {
                return `${sign}$${(abs / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
            }

            if (abs >= 1_000) {
                return `${sign}$${(abs / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
            }

            return `${sign}$${Math.round(abs)}`;
        }

        if (unit === '%') {
            return `${value}%`;
        }

        const formatted = value.toLocaleString('en-US', {
            maximumFractionDigits: 1,
        });

        return unit ? `${formatted} ${unit}` : formatted;
    };
}

function normalize(data?: ChartDatum[]) {
    return (Array.isArray(data) ? data : [])
        .filter((d) => d && (d.label != null || d.name != null))
        .map((d) => ({
            label: String(d.label ?? d.name ?? ''),
            value: Number(d.value) || 0,
        }));
}

function BarChartPreview({ data, title, unit, horizontal }: ChartProps) {
    const rows = normalize(data);
    const format = makeFormatter(unit);
    const config: ChartConfig = { value: { label: title ?? 'Value' } };

    return (
        <ChartContainer config={config} className="h-[260px] w-full">
            <RBarChart
                accessibilityLayer
                data={rows}
                layout={horizontal ? 'vertical' : 'horizontal'}
                margin={{ top: 18, right: 12, left: 4, bottom: 4 }}
            >
                <CartesianGrid
                    horizontal={!horizontal}
                    vertical={Boolean(horizontal)}
                />
                {horizontal ? (
                    <>
                        <XAxis type="number" hide />
                        <YAxis
                            type="category"
                            dataKey="label"
                            tickLine={false}
                            axisLine={false}
                            width={90}
                            tickMargin={6}
                        />
                    </>
                ) : (
                    <>
                        <XAxis
                            dataKey="label"
                            tickLine={false}
                            axisLine={false}
                            tickMargin={8}
                            interval={0}
                            angle={rows.length > 4 ? -30 : 0}
                            textAnchor={rows.length > 4 ? 'end' : 'middle'}
                            height={rows.length > 4 ? 56 : 24}
                        />
                        <YAxis hide />
                    </>
                )}
                <ChartTooltip
                    cursor={false}
                    content={
                        <ChartTooltipContent
                            formatter={(value) => format(value as number)}
                        />
                    }
                />
                <Bar dataKey="value" radius={5}>
                    {rows.map((row, index) => (
                        <Cell
                            key={row.label || index}
                            fill={CHART_COLORS[index % CHART_COLORS.length]}
                        />
                    ))}
                    <LabelList
                        dataKey="value"
                        position={horizontal ? 'right' : 'top'}
                        offset={8}
                        className="fill-foreground text-xs"
                        formatter={format}
                    />
                </Bar>
            </RBarChart>
        </ChartContainer>
    );
}

function LineChartPreview({ data, title, unit }: ChartProps) {
    const rows = normalize(data);
    const format = makeFormatter(unit);
    const config: ChartConfig = {
        value: { label: title ?? 'Value', color: 'var(--chart-1)' },
    };

    return (
        <ChartContainer config={config} className="h-[260px] w-full">
            <RLineChart
                accessibilityLayer
                data={rows}
                margin={{ top: 18, right: 16, left: 4, bottom: 4 }}
            >
                <CartesianGrid vertical={false} />
                <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                />
                <YAxis hide />
                <ChartTooltip
                    cursor={false}
                    content={
                        <ChartTooltipContent
                            formatter={(value) => format(value as number)}
                        />
                    }
                />
                <Line
                    dataKey="value"
                    type="monotone"
                    stroke="var(--color-value)"
                    strokeWidth={2}
                    dot={false}
                />
            </RLineChart>
        </ChartContainer>
    );
}

function PieChartPreview({ data, title, unit }: ChartProps) {
    const rows = normalize(data);
    const format = makeFormatter(unit);
    const config: ChartConfig = Object.fromEntries([
        ['value', { label: title ?? 'Value' }],
        ...rows.map((row, index) => [
            row.label,
            { label: row.label, color: CHART_COLORS[index % CHART_COLORS.length] },
        ]),
    ]);

    return (
        <ChartContainer
            config={config}
            className="mx-auto aspect-square h-[240px]"
        >
            <RPieChart>
                <ChartTooltip
                    content={
                        <ChartTooltipContent
                            formatter={(value) => format(value as number)}
                        />
                    }
                />
                <Pie data={rows} dataKey="value" nameKey="label" innerRadius={48}>
                    {rows.map((row, index) => (
                        <Cell
                            key={row.label || index}
                            fill={CHART_COLORS[index % CHART_COLORS.length]}
                        />
                    ))}
                </Pie>
            </RPieChart>
        </ChartContainer>
    );
}

function Stat({
    label,
    value,
    hint,
    trend,
}: {
    label?: string;
    value?: string | number;
    hint?: string;
    trend?: 'up' | 'down';
}) {
    return (
        <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-2xl font-semibold tabular-nums">{value}</div>
            {hint && (
                <div
                    className={cn(
                        'text-xs',
                        trend === 'up' && 'text-emerald-600',
                        trend === 'down' && 'text-red-600',
                        !trend && 'text-muted-foreground',
                    )}
                >
                    {hint}
                </div>
            )}
        </div>
    );
}

/**
 * The fixed set of components the assistant may use inside a `render_ui` JSX
 * string. Anything outside this map (and plain HTML) simply will not render —
 * so no arbitrary code or components can be instantiated.
 */
export const previewComponents = {
    Alert,
    AlertTitle,
    AlertDescription,
    Badge,
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    CardFooter,
    Separator,
    Stat,
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
    TableCaption,
    BarChart: BarChartPreview,
    LineChart: LineChartPreview,
    PieChart: PieChartPreview,
    RouteMap,
};

export type UiPreviewProps = {
    jsx: string;
    title?: string;
    isStreaming?: boolean;
    /** When provided, shows an "expand" button that opens this UI in the artifact panel. */
    onExpand?: () => void;
};

/** Renders an assistant-authored shadcn UI snippet against the whitelist. */
export function UiPreview({
    jsx,
    title,
    isStreaming = false,
    onExpand,
}: UiPreviewProps) {
    return (
        <div className="not-prose my-2 w-full overflow-x-auto rounded-lg border bg-card p-3">
            {(title || onExpand) && (
                <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">
                        {title}
                    </span>
                    {onExpand && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Open in panel"
                            title="Open in panel"
                            onClick={onExpand}
                        >
                            <Maximize2Icon className="size-3.5" />
                        </Button>
                    )}
                </div>
            )}
            <JSXPreview
                jsx={jsx}
                isStreaming={isStreaming}
                components={previewComponents}
            >
                <JSXPreviewContent />
                <JSXPreviewError />
            </JSXPreview>
        </div>
    );
}
