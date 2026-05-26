import {
    ChevronDownIcon,
    TrendingDownIcon,
    TrendingUpIcon,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { Row } from './pnl-table';
import { WidgetDownloadButton } from './widget-download-button';

const fmtCurrency = (n: number) =>
    `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Signed currency keeps the minus outside the $ (e.g. -$1,200.00).
const fmtNet = (n: number) =>
    `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtInt = (n: number) => n.toLocaleString('en-US');

const fmtPct = (n: number) => `${n.toFixed(2)}%`;

export interface KeyMetricsData {
    drivers: {
        total: number;
    };
    compound_utilization_rate: number;
    event_breakdown: Array<{
        type: string;
        days: number;
        percentage: number;
    }>;
}

interface KeyMetricsProps {
    rows: Row[];
    metrics: KeyMetricsData;
    /** Whole weeks in the window; per-truck averages are divided by this. */
    weeks: number;
    /** Show the PNG download control (hidden for viewers). */
    canDownload?: boolean;
}

export function KeyMetrics({
    rows,
    metrics,
    weeks,
    canDownload = false,
}: KeyMetricsProps) {
    const cardRef = useRef<HTMLDivElement>(null);
    const totalRow = useMemo(
        () => rows.find((r) => r.is_total) ?? null,
        [rows],
    );
    const driverRows = useMemo(
        () =>
            rows.filter(
                (r) => !r.is_total && !r.missing_config && r.total_gross > 0,
            ),
        [rows],
    );

    const gross = totalRow?.total_gross ?? 0;
    const miles = totalRow?.total_miles ?? 0;
    const rpm = totalRow?.rpm ?? 0;

    // Fleet-wide weekly averages: divide by ALL active drivers so the figures
    // reconcile with the "Total Drivers" count (gross ÷ drivers ÷ weeks), rather
    // than only the trucks that grossed (which made the average look inflated).
    const fleetSize = metrics.drivers.total;
    const perDriverWeek = (value: number) =>
        fleetSize > 0 ? value / fleetSize / weeks : 0;

    const avgGrossPerTruck = perDriverWeek(gross);
    const avgMilesPerTruck = perDriverWeek(miles);
    const totalDays = driverRows.reduce((sum, r) => sum + r.days, 0);
    const avgDailyMiles = totalDays > 0 ? miles / totalDays : 0;

    // Net (P&L) for the period, same fleet-wide per-week average as Gross.
    const net = totalRow?.profit_loss ?? 0;
    const avgNetPerTruck = perDriverWeek(net);
    const margin = gross > 0 ? (net / gross) * 100 : 0;
    const netTone = net >= 0 ? 'text-emerald-500' : 'text-red-500';

    const {
        drivers,
        compound_utilization_rate: cur,
        event_breakdown,
    } = metrics;

    return (
        <div
            ref={cardRef}
            className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm"
        >
            <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                    Key Metrics
                </p>
                {canDownload && (
                    <WidgetDownloadButton
                        targetRef={cardRef}
                        filename="key-metrics"
                    />
                )}
            </div>

            {/* Drivers */}
            <div className="rounded-lg border bg-muted/30 px-3 py-2">
                <p className="text-sm font-medium">
                    Total Drivers: {fmtInt(drivers.total)}
                </p>
            </div>

            {/* Gross */}
            <div className="rounded-lg border bg-muted/30 px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">
                        Gross:{' '}
                        <span className="font-bold text-emerald-500">
                            {fmtCurrency(gross)}
                        </span>
                    </p>
                    <div className="flex gap-4 text-right text-xs">
                        <div>
                            <p className="text-muted-foreground">
                                Avg/Truck/wk
                            </p>
                            <p className="font-semibold text-emerald-500">
                                {fmtCurrency(avgGrossPerTruck)}
                            </p>
                        </div>
                        <div>
                            <p className="text-muted-foreground">RPM</p>
                            <p className="font-semibold text-emerald-500">
                                {fmtCurrency(rpm)}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Net */}
            <div className="rounded-lg border bg-muted/30 px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">
                        Net:{' '}
                        <span className={cn('font-bold', netTone)}>
                            {fmtNet(net)}
                        </span>
                    </p>
                    <div className="flex gap-4 text-right text-xs">
                        <div>
                            <p className="text-muted-foreground">
                                Avg/Truck/wk
                            </p>
                            <p className={cn('font-semibold', netTone)}>
                                {fmtNet(avgNetPerTruck)}
                            </p>
                        </div>
                        <div>
                            <p className="text-muted-foreground">Margin</p>
                            <p className={cn('font-semibold', netTone)}>
                                {fmtPct(margin)}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Miles */}
            <div className="rounded-lg border bg-muted/30 px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">
                        Miles:{' '}
                        <span className="font-bold text-orange-500">
                            {fmtInt(Math.round(miles))}
                        </span>
                    </p>
                    <div className="flex gap-4 text-right text-xs">
                        <div>
                            <p className="text-muted-foreground">
                                Avg/Truck/wk
                            </p>
                            <p className="font-semibold text-orange-500">
                                {avgMilesPerTruck.toFixed(2)}
                            </p>
                        </div>
                        <div>
                            <p className="text-muted-foreground">Avg Daily</p>
                            <p className="font-semibold text-orange-500">
                                {avgDailyMiles.toFixed(2)}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Compound Utilization Rate — collapsible with event breakdown inside */}
            <Collapsible className="rounded-lg border bg-muted/30">
                <CollapsibleTrigger className="group flex w-full items-center justify-between px-3 py-2 text-sm">
                    <span className="font-medium">
                        Compound Utilization Rate
                    </span>
                    <div className="flex items-center gap-2">
                        <Badge value={cur} tone={cur < 15 ? 'pos' : 'neg'} />
                        <ChevronDownIcon className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                    </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="flex flex-col gap-1 px-2 pb-2">
                    {event_breakdown
                        .filter((e) => e.days > 0)
                        .slice(0, 5)
                        .map((event) => (
                            <EventRow
                                key={event.type}
                                type={event.type}
                                percentage={event.percentage}
                                days={event.days}
                            />
                        ))}
                </CollapsibleContent>
            </Collapsible>
        </div>
    );
}

function Badge({ value, tone }: { value: number; tone: 'pos' | 'neg' }) {
    const Icon = tone === 'pos' ? TrendingUpIcon : TrendingDownIcon;

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
                tone === 'pos'
                    ? 'bg-emerald-500/15 text-emerald-500'
                    : 'bg-red-500/15 text-red-500',
            )}
        >
            <Icon className="h-3 w-3" />
            {fmtPct(value)}
        </span>
    );
}

function EventRow({
    type,
    percentage,
    days,
}: {
    type: string;
    percentage: number;
    days: number;
}) {
    const [open, setOpen] = useState(false);
    const label = type.charAt(0) + type.slice(1).toLowerCase();

    return (
        <Collapsible
            open={open}
            onOpenChange={setOpen}
            className="rounded-lg border bg-muted/30"
        >
            <CollapsibleTrigger className="group flex w-full items-center justify-between px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                    <span className="font-medium">{label}</span>
                    <Badge value={percentage} tone="pos" />
                </div>
                <ChevronDownIcon className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="px-3 pb-2 text-xs text-muted-foreground">
                <p>
                    {days.toFixed(2)} driver-days in this status during the
                    selected period.
                </p>
            </CollapsibleContent>
        </Collapsible>
    );
}
