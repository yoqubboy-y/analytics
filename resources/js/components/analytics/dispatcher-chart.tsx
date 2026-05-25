import { useMemo, useState } from 'react';
import { Bar, BarChart, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import { cn } from '@/lib/utils';
import type { Row } from './pnl-table';

interface DispatcherChartProps {
    rows: Row[];
    startDate: string;
    endDate: string;
}

type Mode = 'gross' | 'per_truck';

const CHART_COLORS = [
    'var(--chart-1)',
    'var(--chart-2)',
    'var(--chart-3)',
    'var(--chart-4)',
    'var(--chart-5)',
];

export function DispatcherChart({
    rows,
    startDate,
    endDate,
}: DispatcherChartProps) {
    const [mode, setMode] = useState<Mode>('gross');

    const driverRows = useMemo(() => rows.filter((r) => !r.is_total), [rows]);

    const windowDays = useMemo(() => {
        const start = Date.parse(startDate);
        const end = Date.parse(endDate);

        if (Number.isNaN(start) || Number.isNaN(end)) {
            return 1;
        }

        return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
    }, [startDate, endDate]);

    // Whole weeks in the window — per-truck gross is shown as a weekly average.
    const weeks = useMemo(() => Math.max(1, windowDays / 7), [windowDays]);

    const { data, config } = useMemo(() => {
        type Bucket = {
            gross: number;
            pl: number;
            miles: number;
            productiveDays: number;
            drivers: Set<number>;
            trucks: Set<string>;
        };
        const byDispatcher = new Map<string, Bucket>();

        for (const row of driverRows) {
            const disp = row.dispatcher || 'Unassigned';

            if (!byDispatcher.has(disp)) {
                byDispatcher.set(disp, {
                    gross: 0,
                    pl: 0,
                    miles: 0,
                    productiveDays: 0,
                    drivers: new Set(),
                    trucks: new Set(),
                });
            }

            const entry = byDispatcher.get(disp)!;
            entry.gross += row.total_gross;
            entry.pl += row.profit_loss ?? 0;
            entry.miles += row.total_miles;

            if (row.total_gross > 0) {
                entry.productiveDays += row.days;
            }

            if (row.driver_id != null) {
                entry.drivers.add(row.driver_id);
            }

            if (row.truck_number) {
                entry.trucks.add(row.truck_number);
            }
        }

        const sorted = Array.from(byDispatcher.entries())
            .map(
                ([
                    name,
                    { gross, pl, miles, productiveDays, drivers, trucks },
                ]) => {
                    const driverCount = drivers.size;
                    const truckCount = trucks.size || driverCount || 1;
                    const key = name.toLowerCase().replace(/\s+/g, '_');
                    const rpm = miles > 0 ? gross / miles : 0;
                    const utilization =
                        driverCount > 0
                            ? (productiveDays / (driverCount * windowDays)) *
                              100
                            : 0;

                    return {
                        name,
                        key,
                        gross,
                        pl,
                        miles,
                        rpm,
                        utilization,
                        drivers: driverCount,
                        trucks: trucks.size,
                        perTruckGross: gross / truckCount / weeks,
                    };
                },
            )
            .sort((a, b) => b.gross - a.gross);

        const chartData = sorted.map((d, i) => ({
            dispatcher: d.key,
            value: mode === 'gross' ? d.gross : d.perTruckGross,
            fill: CHART_COLORS[i % CHART_COLORS.length],
            trucks: d.trucks,
            drivers: d.drivers,
            miles: d.miles,
            rpm: d.rpm,
            utilization: d.utilization,
            fullName: d.name,
        }));

        const chartConfig: ChartConfig = {
            value: { label: mode === 'gross' ? 'Gross' : 'Gross / Truck / wk' },
            ...Object.fromEntries(
                sorted.map((d, i) => [
                    d.key,
                    {
                        label: d.name,
                        color: CHART_COLORS[i % CHART_COLORS.length],
                    },
                ]),
            ),
        };

        return { data: chartData, config: chartConfig };
    }, [driverRows, mode, windowDays, weeks]);

    return (
        <Card className="flex flex-col">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                        Dispatcher Performance
                    </CardTitle>
                    <div className="flex overflow-hidden rounded-md border text-xs font-medium">
                        <button
                            onClick={() => setMode('gross')}
                            className={cn(
                                'px-3 py-1.5 transition-colors',
                                mode === 'gross'
                                    ? 'bg-primary text-primary-foreground'
                                    : 'text-muted-foreground hover:bg-accent',
                            )}
                        >
                            Gross
                        </button>
                        <button
                            onClick={() => setMode('per_truck')}
                            className={cn(
                                'border-l px-3 py-1.5 transition-colors',
                                mode === 'per_truck'
                                    ? 'bg-primary text-primary-foreground'
                                    : 'text-muted-foreground hover:bg-accent',
                            )}
                        >
                            Per Truck/wk
                        </button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pb-4">
                <ChartContainer
                    config={config}
                    className="aspect-auto h-[280px] w-full"
                >
                    <BarChart
                        accessibilityLayer
                        data={data}
                        barCategoryGap="8%"
                        margin={{ left: 4, right: 4, bottom: 44 }}
                    >
                        <XAxis
                            dataKey="dispatcher"
                            type="category"
                            tickLine={false}
                            tickMargin={8}
                            axisLine={false}
                            angle={-35}
                            textAnchor="end"
                            interval={0}
                            tickFormatter={(value) =>
                                (
                                    config[value as keyof typeof config]
                                        ?.label as string
                                )?.split(' ')[0] ?? value
                            }
                        />
                        <YAxis dataKey="value" type="number" hide />
                        <ChartTooltip
                            cursor={false}
                            content={
                                <ChartTooltipContent
                                    hideLabel
                                    formatter={(value, _name, item) => {
                                        const drivers = item.payload
                                            ?.drivers as number | undefined;
                                        const trucks = item.payload?.trucks as
                                            | number
                                            | undefined;
                                        const miles = item.payload?.miles as
                                            | number
                                            | undefined;
                                        const rpm = item.payload?.rpm as
                                            | number
                                            | undefined;
                                        const utilization = item.payload
                                            ?.utilization as number | undefined;
                                        const full = item.payload?.fullName as
                                            | string
                                            | undefined;
                                        const formatted = `$${Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

                                        return (
                                            <div className="flex flex-col gap-0.5">
                                                <span className="font-medium">
                                                    {full}
                                                </span>
                                                <span>{formatted}</span>
                                                {drivers != null && (
                                                    <span className="text-muted-foreground">
                                                        {drivers} driver
                                                        {drivers !== 1
                                                            ? 's'
                                                            : ''}
                                                        {trucks != null &&
                                                        trucks !== drivers
                                                            ? ` · ${trucks} truck${trucks !== 1 ? 's' : ''}`
                                                            : ''}
                                                    </span>
                                                )}
                                                {miles != null && (
                                                    <span className="text-muted-foreground">
                                                        {Math.round(
                                                            miles,
                                                        ).toLocaleString(
                                                            'en-US',
                                                        )}{' '}
                                                        mi
                                                    </span>
                                                )}
                                                {rpm != null && rpm > 0 && (
                                                    <span className="text-muted-foreground">
                                                        RPM ${rpm.toFixed(2)}
                                                    </span>
                                                )}
                                                {utilization != null &&
                                                    utilization > 0 && (
                                                        <span className="text-muted-foreground">
                                                            Utilization{' '}
                                                            {utilization.toFixed(
                                                                1,
                                                            )}
                                                            %
                                                        </span>
                                                    )}
                                            </div>
                                        );
                                    }}
                                />
                            }
                        />
                        <Bar dataKey="value" radius={5} maxBarSize={9999} />
                    </BarChart>
                </ChartContainer>
            </CardContent>
        </Card>
    );
}
