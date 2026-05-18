import { Head, router, usePage } from '@inertiajs/react';
import { index as analyticsIndex } from '@/actions/App/Http/Controllers/Analytics/AnalyticsController';
import {
    type Expense,
    type Row,
    PnlTable,
} from '@/components/analytics/pnl-table';
import { KeyMetrics, type KeyMetricsData } from '@/components/analytics/key-metrics';
import { DispatcherChart } from '@/components/analytics/dispatcher-chart';
import { WeekRangePicker } from '@/components/week-range-picker';

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

    function handleWeekChange(start: string, end: string) {
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
                    <WeekRangePicker
                        startDate={startDate}
                        endDate={endDate}
                        onWeekChange={handleWeekChange}
                    />
                </div>

                {/* Summary cards */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <KeyMetrics rows={rows} metrics={keyMetrics} />
                    <DispatcherChart rows={rows} />
                    <div className="rounded-xl border bg-card shadow-sm" />
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
