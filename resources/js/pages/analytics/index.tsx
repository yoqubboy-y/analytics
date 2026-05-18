import { Head, router, usePage } from '@inertiajs/react';
import { index as analyticsIndex } from '@/actions/App/Http/Controllers/Analytics/AnalyticsController';
import {
    type Expense,
    type Row,
    PnlTable,
} from '@/components/analytics/pnl-table';
import { WeekRangePicker } from '@/components/week-range-picker';

type Props = {
    rows: Row[];
    expenses: Expense[];
    startDate: string;
    endDate: string;
};

export default function AnalyticsDashboard({
    rows,
    expenses,
    startDate,
    endDate,
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
                <div className="flex items-center justify-between">
                    <h1 className="text-xl font-semibold">P&amp;L Report</h1>
                    <WeekRangePicker
                        startDate={startDate}
                        endDate={endDate}
                        onWeekChange={handleWeekChange}
                    />
                </div>

                <PnlTable rows={rows} expenses={expenses} />
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
