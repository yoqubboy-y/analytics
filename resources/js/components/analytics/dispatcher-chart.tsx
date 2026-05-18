import { useMemo, useState } from 'react';
import { Bar, BarChart, XAxis, YAxis } from 'recharts';
import { type Row } from './pnl-table';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from '@/components/ui/chart';

interface DispatcherChartProps {
    rows: Row[];
}

type Mode = 'gross' | 'per_truck';

const CHART_COLORS = [
    'var(--chart-1)',
    'var(--chart-2)',
    'var(--chart-3)',
    'var(--chart-4)',
    'var(--chart-5)',
];

export function DispatcherChart({ rows }: DispatcherChartProps) {
    const [mode, setMode] = useState<Mode>('gross');

    const driverRows = useMemo(() => rows.filter((r) => !r.is_total && !r.missing_config), [rows]);

    const { data, config } = useMemo(() => {
        const byDispatcher = new Map<string, { gross: number; pl: number; miles: number; days: number; trucks: Set<string> }>();
        const periodDays = driverRows.reduce((max, r) => Math.max(max, r.days), 0);

        for (const row of driverRows) {
            const disp = row.dispatcher || 'Unassigned';
            if (!byDispatcher.has(disp)) {
                byDispatcher.set(disp, { gross: 0, pl: 0, miles: 0, days: 0, trucks: new Set() });
            }
            const entry = byDispatcher.get(disp)!;
            entry.gross += row.total_gross;
            entry.pl += row.profit_loss ?? 0;
            entry.miles += row.total_miles;
            entry.days += row.days;
            if (row.truck_number) entry.trucks.add(row.truck_number);
        }

        const sorted = Array.from(byDispatcher.entries())
            .map(([name, { gross, pl, miles, days, trucks }]) => {
                const truckCount = trucks.size || 1;
                const key = name.toLowerCase().replace(/\s+/g, '_');
                const rpm = miles > 0 ? gross / miles : 0;
                const utilization = periodDays > 0 ? (days / (truckCount * periodDays)) * 100 : 0;
                return { name, key, gross, pl, miles, rpm, days, utilization, trucks: trucks.size, perTruckGross: gross / truckCount };
            })
            .sort((a, b) => b.gross - a.gross);

        const chartData = sorted.map((d, i) => ({
            dispatcher: d.key,
            value: mode === 'gross' ? d.gross : d.perTruckGross,
            fill: CHART_COLORS[i % CHART_COLORS.length],
            trucks: d.trucks,
            miles: d.miles,
            rpm: d.rpm,
            utilization: d.utilization,
            fullName: d.name,
        }));

        const chartConfig: ChartConfig = {
            value: { label: mode === 'gross' ? 'Gross' : 'Gross / Truck' },
            ...Object.fromEntries(
                sorted.map((d, i) => [
                    d.key,
                    { label: d.name, color: CHART_COLORS[i % CHART_COLORS.length] },
                ]),
            ),
        };

        return { data: chartData, config: chartConfig };
    }, [driverRows, mode]);

    return (
        <Card className="flex flex-col">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        Dispatcher Performance
                    </CardTitle>
                    <div className="flex rounded-md border text-xs font-medium overflow-hidden">
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
                                'px-3 py-1.5 transition-colors border-l',
                                mode === 'per_truck'
                                    ? 'bg-primary text-primary-foreground'
                                    : 'text-muted-foreground hover:bg-accent',
                            )}
                        >
                            Per Truck
                        </button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pb-4">
                <ChartContainer config={config} className="aspect-auto h-[280px] w-full">
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
                                (config[value as keyof typeof config]?.label as string)?.split(' ')[0] ?? value
                            }
                        />
                        <YAxis dataKey="value" type="number" hide />
                        <ChartTooltip
                            cursor={false}
                            content={
                                <ChartTooltipContent
                                    hideLabel
                                    formatter={(value, _name, item) => {
                                        const trucks = item.payload?.trucks as number | undefined;
                                        const miles = item.payload?.miles as number | undefined;
                                        const rpm = item.payload?.rpm as number | undefined;
                                        const utilization = item.payload?.utilization as number | undefined;
                                        const full = item.payload?.fullName as string | undefined;
                                        const formatted = `$${Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
                                        return (
                                            <div className="flex flex-col gap-0.5">
                                                <span className="font-medium">{full}</span>
                                                <span>{formatted}</span>
                                                {trucks != null && (
                                                    <span className="text-muted-foreground">{trucks} truck{trucks !== 1 ? 's' : ''}</span>
                                                )}
                                                {miles != null && (
                                                    <span className="text-muted-foreground">{Math.round(miles).toLocaleString('en-US')} mi</span>
                                                )}
                                                {rpm != null && rpm > 0 && (
                                                    <span className="text-muted-foreground">RPM ${rpm.toFixed(2)}</span>
                                                )}
                                                {utilization != null && utilization > 0 && (
                                                    <span className="text-muted-foreground">Utilization {utilization.toFixed(1)}%</span>
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
