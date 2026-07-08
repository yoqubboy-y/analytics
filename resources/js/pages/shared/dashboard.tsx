import { Head } from '@inertiajs/react';
import { format } from 'date-fns';
import { useMemo } from 'react';
import { DispatcherChart } from '@/components/analytics/dispatcher-chart';
import { DispatcherRankings } from '@/components/analytics/dispatcher-rankings';
import { KeyMetrics } from '@/components/analytics/key-metrics';
import type { KeyMetricsData } from '@/components/analytics/key-metrics';
import { PnlTable } from '@/components/analytics/pnl-table';
import type { Expense, Row } from '@/components/analytics/pnl-table';

type Props = {
    teamName: string;
    rows: Row[];
    /** Per-(driver, dispatcher) rows for the dispatcher widgets — see analytics/index. */
    dispatcherRows: Row[];
    expenses: Expense[];
    startDate: string;
    endDate: string;
    keyMetrics: KeyMetricsData;
    /** Widget keys to show; null = the whole dashboard. */
    widgets: string[] | null;
};

export default function SharedDashboard({
    teamName,
    rows,
    dispatcherRows,
    expenses,
    startDate,
    endDate,
    keyMetrics,
    widgets,
}: Props) {
    const weeks = useMemo(() => {
        const start = Date.parse(startDate);
        const end = Date.parse(endDate);

        if (Number.isNaN(start) || Number.isNaN(end)) {
            return 1;
        }

        const days = Math.round((end - start) / 86_400_000) + 1;

        return Math.max(1, days / 7);
    }, [startDate, endDate]);

    const period = `${format(new Date(startDate + 'T00:00:00'), 'MMM d')} – ${format(new Date(endDate + 'T00:00:00'), 'MMM d, yyyy')}`;

    const shows = (key: string) => widgets === null || widgets.includes(key);

    const topCardCount = [
        'key_metrics',
        'dispatcher_chart',
        'dispatcher_rankings',
    ].filter(shows).length;

    const topGridCols =
        topCardCount >= 3
            ? 'lg:grid-cols-3'
            : topCardCount === 2
              ? 'lg:grid-cols-2'
              : 'lg:grid-cols-1';

    return (
        <>
            <Head title={`${teamName} · Dashboard`} />

            <div className="min-h-screen bg-background text-foreground">
                <header className="border-b">
                    <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-3">
                        <div>
                            <h1 className="text-lg font-semibold">
                                {teamName}
                            </h1>
                            <p className="text-sm text-muted-foreground">
                                {period}
                            </p>
                        </div>
                        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                            Shared · read-only
                        </span>
                    </div>
                </header>

                <main className="mx-auto flex max-w-7xl flex-col gap-4 p-4">
                    {topCardCount > 0 && (
                        <div
                            className={`grid grid-cols-1 gap-4 ${topGridCols}`}
                        >
                            {shows('key_metrics') && (
                                <KeyMetrics
                                    rows={rows}
                                    metrics={keyMetrics}
                                    weeks={weeks}
                                />
                            )}
                            {shows('dispatcher_chart') && (
                                <DispatcherChart
                                    rows={dispatcherRows}
                                    startDate={startDate}
                                    endDate={endDate}
                                />
                            )}
                            {shows('dispatcher_rankings') && (
                                <DispatcherRankings
                                    rows={dispatcherRows}
                                    weeks={weeks}
                                />
                            )}
                        </div>
                    )}

                    {shows('pnl_table') && (
                        <PnlTable
                            rows={rows}
                            expenses={expenses}
                            title="P&L Report"
                            canDownload={false}
                        />
                    )}
                </main>
            </div>
        </>
    );
}
