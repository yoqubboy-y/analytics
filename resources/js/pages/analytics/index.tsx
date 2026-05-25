import { Head, router, usePage } from '@inertiajs/react';
import { useMemo } from 'react';
import { index as analyticsIndex } from '@/actions/App/Http/Controllers/Analytics/AnalyticsController';
import { DispatcherChart } from '@/components/analytics/dispatcher-chart';
import { DispatcherRankings } from '@/components/analytics/dispatcher-rankings';
import { KeyMetrics } from '@/components/analytics/key-metrics';
import type { KeyMetricsData } from '@/components/analytics/key-metrics';
import { PnlTable } from '@/components/analytics/pnl-table';
import type { Expense, Row } from '@/components/analytics/pnl-table';
import { DateRangePicker } from '@/components/date-range-picker';

type Props = {
    rows: Row[];
    expenses: Expense[];
    startDate: string;
    endDate: string;
    keyMetrics: KeyMetricsData;
};

export default function AnalyticsDashboard({
    rows,
    expenses,
    startDate,
    endDate,
    keyMetrics,
}: Props) {
    const page = usePage();
    const slug = page.props.currentTeam?.slug ?? '';

    // Number of (whole) weeks in the window — used to normalise per-truck
    // averages so a multi-week view shows weekly figures, not window totals.
    const weeks = useMemo(() => {
        const start = Date.parse(startDate);
        const end = Date.parse(endDate);

        if (Number.isNaN(start) || Number.isNaN(end)) {
            return 1;
        }

        const days = Math.round((end - start) / 86_400_000) + 1;

        return Math.max(1, days / 7);
    }, [startDate, endDate]);

    function handleRangeChange(start: string, end: string) {
        router.get(
            analyticsIndex.url(slug),
            { start_date: start, end_date: end },
            { preserveState: true },
        );
    }

    return (
        <>
            <Head title="Analytics" />
            <div className="flex flex-col gap-4 p-4">
                <div className="flex justify-end">
                    <DateRangePicker
                        startDate={startDate}
                        endDate={endDate}
                        onRangeChange={handleRangeChange}
                    />
                </div>

                {/* Summary cards */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <KeyMetrics
                        rows={rows}
                        metrics={keyMetrics}
                        weeks={weeks}
                    />
                    <DispatcherChart
                        rows={rows}
                        startDate={startDate}
                        endDate={endDate}
                    />
                    <DispatcherRankings rows={rows} weeks={weeks} />
                </div>

                <PnlTable rows={rows} expenses={expenses} title="P&L Report" />
            </div>
        </>
    );
}

AnalyticsDashboard.layout = (props: {
    currentTeam?: { slug: string } | null;
}) => ({
    breadcrumbs: [
        {
            title: 'Analytics',
            href: props.currentTeam
                ? analyticsIndex.url(props.currentTeam.slug)
                : '/',
        },
    ],
});
