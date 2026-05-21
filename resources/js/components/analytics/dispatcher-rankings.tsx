import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { type Row } from './pnl-table';

type Metric = 'net' | 'gross' | 'rpm';

interface DispatcherRankingsProps {
    rows: Row[];
}

const fmtCurrency = (n: number) =>
    `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtRpm = (n: number) =>
    `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function DispatcherRankings({ rows }: DispatcherRankingsProps) {
    const [metric, setMetric] = useState<Metric>('net');

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
            if (row.is_total || row.missing_config || row.total_gross <= 0) continue;
            const disp = row.dispatcher || 'Unassigned';
            if (!byDispatcher.has(disp)) {
                byDispatcher.set(disp, { pl: 0, gross: 0, miles: 0, trucks: new Set(), drivers: new Set() });
            }
            const entry = byDispatcher.get(disp)!;
            entry.pl += row.profit_loss ?? 0;
            entry.gross += row.total_gross;
            entry.miles += row.total_miles;
            if (row.truck_number) entry.trucks.add(row.truck_number);
            if (row.driver_id != null) entry.drivers.add(row.driver_id);
        }

        const list = Array.from(byDispatcher.entries()).map(([name, b]) => {
            const truckCount = b.trucks.size || b.drivers.size || 1;
            return {
                name,
                trucks: b.trucks.size || b.drivers.size,
                avgNet: b.pl / truckCount,
                avgGross: b.gross / truckCount,
                rpm: b.miles > 0 ? b.gross / b.miles : 0,
            };
        });

        const sorter: Record<Metric, (a: (typeof list)[number], b: (typeof list)[number]) => number> = {
            net: (a, b) => b.avgNet - a.avgNet,
            gross: (a, b) => b.avgGross - a.avgGross,
            rpm: (a, b) => b.rpm - a.rpm,
        };
        return list.sort(sorter[metric]);
    }, [rows, metric]);

    return (
        <div className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm">
            <div className="mb-1 flex items-center justify-between">
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Dispatcher Rankings
                </p>
                <div className="flex overflow-hidden rounded-md border text-xs font-medium">
                    <SortButton active={metric === 'net'} onClick={() => setMetric('net')}>
                        Net
                    </SortButton>
                    <SortButton active={metric === 'gross'} onClick={() => setMetric('gross')} border>
                        Gross
                    </SortButton>
                    <SortButton active={metric === 'rpm'} onClick={() => setMetric('rpm')} border>
                        RPM
                    </SortButton>
                </div>
            </div>

            {ranked.length === 0 ? (
                <div className="rounded-lg border bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
                    No dispatcher activity in this period.
                </div>
            ) : (
                <div className="flex flex-col gap-1.5 overflow-y-auto pr-1" style={{ maxHeight: 320 }}>
                    {ranked.map((d, idx) => (
                        <RankRow key={d.name} rank={idx + 1} dispatcher={d} metric={metric} />
                    ))}
                </div>
            )}
        </div>
    );
}

function SortButton({
    active,
    onClick,
    border,
    children,
}: {
    active: boolean;
    onClick: () => void;
    border?: boolean;
    children: React.ReactNode;
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                'px-3 py-1.5 transition-colors',
                border && 'border-l',
                active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent',
            )}
        >
            {children}
        </button>
    );
}

interface Ranked {
    name: string;
    trucks: number;
    avgNet: number;
    avgGross: number;
    rpm: number;
}

function RankRow({ rank, dispatcher: d, metric }: { rank: number; dispatcher: Ranked; metric: Metric }) {
    const primary =
        metric === 'net' ? fmtCurrency(d.avgNet) : metric === 'gross' ? fmtCurrency(d.avgGross) : fmtRpm(d.rpm);

    const primaryTone =
        metric === 'net'
            ? d.avgNet >= 0
                ? 'text-emerald-500'
                : 'text-red-500'
            : 'text-emerald-500';

    return (
        <div className="rounded-lg border bg-muted/30 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 text-xs font-semibold text-muted-foreground tabular-nums">
                        {rank}.
                    </span>
                    <p className="truncate text-sm font-medium">{d.name}</p>
                </div>
                <p className={cn('shrink-0 text-sm font-bold tabular-nums', primaryTone)}>{primary}</p>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
                <span>
                    {d.trucks} truck{d.trucks !== 1 ? 's' : ''}
                </span>
                {metric !== 'net' && (
                    <span>
                        Net <span className={d.avgNet >= 0 ? 'text-emerald-500' : 'text-red-500'}>{fmtCurrency(d.avgNet)}</span>
                    </span>
                )}
                {metric !== 'gross' && <span>Gross {fmtCurrency(d.avgGross)}</span>}
                {metric !== 'rpm' && <span>RPM {fmtRpm(d.rpm)}</span>}
            </div>
        </div>
    );
}
