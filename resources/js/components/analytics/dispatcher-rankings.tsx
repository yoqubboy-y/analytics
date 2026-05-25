import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { Row } from './pnl-table';

type SortKey = 'total_net' | 'avg_net' | 'total_gross' | 'avg_gross' | 'rpm';
type Direction = 'asc' | 'desc';

interface DispatcherRankingsProps {
    rows: Row[];
    /** Whole weeks in the window; per-truck averages are divided by this. */
    weeks: number;
}

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
    { value: 'total_net', label: 'Total Net' },
    { value: 'avg_net', label: 'Avg Net / Truck / wk' },
    { value: 'total_gross', label: 'Total Gross' },
    { value: 'avg_gross', label: 'Avg Gross / Truck / wk' },
    { value: 'rpm', label: 'RPM' },
];

const fmtCurrency = (n: number) =>
    `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtRpm = (n: number) =>
    `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function DispatcherRankings({ rows, weeks }: DispatcherRankingsProps) {
    const [sortBy, setSortBy] = useState<SortKey>('total_net');
    const [direction, setDirection] = useState<Direction>('desc');

    const ranked = useMemo(() => {
        type Bucket = {
            pl: number;
            gross: number;
            miles: number;
            trucks: Set<string>;
            drivers: Set<number>;
        };
        const byDispatcher = new Map<string, Bucket>();

        for (const row of rows) {
            if (row.is_total || row.missing_config) {
                continue;
            }

            const disp = row.dispatcher || 'Unassigned';

            if (!byDispatcher.has(disp)) {
                byDispatcher.set(disp, {
                    pl: 0,
                    gross: 0,
                    miles: 0,
                    trucks: new Set(),
                    drivers: new Set(),
                });
            }

            const entry = byDispatcher.get(disp)!;
            entry.pl += row.profit_loss ?? 0;
            entry.gross += row.total_gross;
            entry.miles += row.total_miles;

            if (row.truck_number) {
                entry.trucks.add(row.truck_number);
            }

            if (row.driver_id != null) {
                entry.drivers.add(row.driver_id);
            }
        }

        const list = Array.from(byDispatcher.entries()).map(([name, b]) => {
            const truckCount = b.trucks.size || b.drivers.size || 1;

            return {
                name,
                trucks: b.trucks.size || b.drivers.size,
                totalNet: b.pl,
                totalGross: b.gross,
                avgNet: b.pl / truckCount / weeks,
                avgGross: b.gross / truckCount / weeks,
                rpm: b.miles > 0 ? b.gross / b.miles : 0,
            };
        });

        const valueOf = (item: (typeof list)[number]) => {
            switch (sortBy) {
                case 'total_net':
                    return item.totalNet;
                case 'avg_net':
                    return item.avgNet;
                case 'total_gross':
                    return item.totalGross;
                case 'avg_gross':
                    return item.avgGross;
                case 'rpm':
                    return item.rpm;
            }
        };

        return list.sort((a, b) => {
            const av = valueOf(a);
            const bv = valueOf(b);

            return direction === 'desc' ? bv - av : av - bv;
        });
    }, [rows, sortBy, direction, weeks]);

    return (
        <div className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm">
            <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                    Dispatcher Rankings
                </p>
                <div className="flex items-center gap-1">
                    <Select
                        value={sortBy}
                        onValueChange={(v) => setSortBy(v as SortKey)}
                    >
                        <SelectTrigger className="h-7 w-auto gap-1.5 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent align="end">
                            {SORT_OPTIONS.map((opt) => (
                                <SelectItem
                                    key={opt.value}
                                    value={opt.value}
                                    className="text-xs"
                                >
                                    {opt.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <button
                        onClick={() =>
                            setDirection((d) => (d === 'desc' ? 'asc' : 'desc'))
                        }
                        className="flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-accent"
                        aria-label={
                            direction === 'desc'
                                ? 'Sort descending'
                                : 'Sort ascending'
                        }
                        title={
                            direction === 'desc' ? 'Descending' : 'Ascending'
                        }
                    >
                        {direction === 'desc' ? (
                            <ArrowDownIcon className="h-3.5 w-3.5" />
                        ) : (
                            <ArrowUpIcon className="h-3.5 w-3.5" />
                        )}
                    </button>
                </div>
            </div>

            {ranked.length === 0 ? (
                <div className="rounded-lg border bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
                    No dispatcher activity in this period.
                </div>
            ) : (
                <div
                    className="flex flex-col gap-1.5 overflow-y-auto pr-1"
                    style={{ maxHeight: 320 }}
                >
                    {ranked.map((d, idx) => (
                        <RankRow
                            key={d.name}
                            rank={idx + 1}
                            dispatcher={d}
                            sortBy={sortBy}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

interface Ranked {
    name: string;
    trucks: number;
    totalNet: number;
    totalGross: number;
    avgNet: number;
    avgGross: number;
    rpm: number;
}

function RankRow({
    rank,
    dispatcher: d,
    sortBy,
}: {
    rank: number;
    dispatcher: Ranked;
    sortBy: SortKey;
}) {
    const isNetFamily = sortBy === 'total_net' || sortBy === 'avg_net';
    const isGrossFamily = sortBy === 'total_gross' || sortBy === 'avg_gross';

    let primaryValue: number;
    let primary: string;
    let subValue: string | null = null;

    switch (sortBy) {
        case 'total_net':
            primaryValue = d.totalNet;
            primary = fmtCurrency(d.totalNet);
            subValue = `${fmtCurrency(d.avgNet)} Avg Net / Truck / wk`;
            break;
        case 'avg_net':
            primaryValue = d.avgNet;
            primary = fmtCurrency(d.avgNet);
            subValue = `${fmtCurrency(d.totalNet)} Total Net`;
            break;
        case 'total_gross':
            primaryValue = d.totalGross;
            primary = fmtCurrency(d.totalGross);
            subValue = `${fmtCurrency(d.avgGross)} Avg Gross / Truck / wk`;
            break;
        case 'avg_gross':
            primaryValue = d.avgGross;
            primary = fmtCurrency(d.avgGross);
            subValue = `${fmtCurrency(d.totalGross)} Total Gross`;
            break;
        case 'rpm':
            primaryValue = d.rpm;
            primary = fmtRpm(d.rpm);
            break;
    }

    const primaryTone = isNetFamily
        ? primaryValue >= 0
            ? 'text-emerald-500'
            : 'text-red-500'
        : 'text-emerald-500';

    const subTone = sortBy === 'rpm' ? 'text-muted-foreground' : 'text-sky-500';

    return (
        <div className="rounded-lg border bg-muted/30 px-3 py-2">
            <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 text-xs font-semibold text-muted-foreground tabular-nums">
                        {rank}.
                    </span>
                    <p className="truncate text-sm font-medium">{d.name}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end">
                    <p
                        className={cn(
                            'text-sm font-bold tabular-nums',
                            primaryTone,
                        )}
                    >
                        {primary}
                    </p>
                    {subValue && (
                        <p className={cn('text-xs tabular-nums', subTone)}>
                            {subValue}
                        </p>
                    )}
                </div>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
                <span>
                    {d.trucks} truck{d.trucks !== 1 ? 's' : ''}
                </span>
                {!isNetFamily && (
                    <span>
                        Net{' '}
                        <span
                            className={
                                d.totalNet >= 0
                                    ? 'text-emerald-500'
                                    : 'text-red-500'
                            }
                        >
                            {fmtCurrency(d.totalNet)}
                        </span>
                    </span>
                )}
                {!isGrossFamily && (
                    <span>Gross {fmtCurrency(d.totalGross)}</span>
                )}
                {sortBy !== 'rpm' && <span>RPM {fmtRpm(d.rpm)}</span>}
            </div>
        </div>
    );
}
