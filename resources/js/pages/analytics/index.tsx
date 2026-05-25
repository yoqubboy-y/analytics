import { Head, router, usePage } from '@inertiajs/react';
import { DownloadIcon, Loader2Icon, Share2Icon } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { index as analyticsIndex } from '@/actions/App/Http/Controllers/Analytics/AnalyticsController';
import { DispatcherChart } from '@/components/analytics/dispatcher-chart';
import { DispatcherRankings } from '@/components/analytics/dispatcher-rankings';
import { KeyMetrics } from '@/components/analytics/key-metrics';
import type { KeyMetricsData } from '@/components/analytics/key-metrics';
import { PnlTable } from '@/components/analytics/pnl-table';
import type { Expense, Row } from '@/components/analytics/pnl-table';
import { DateRangePicker } from '@/components/date-range-picker';
import { ShareDashboardModal } from '@/components/share-dashboard-modal';
import type { DashboardShareItem } from '@/components/share-dashboard-modal';
import { Button } from '@/components/ui/button';
import { downloadElementAsPng } from '@/lib/download';

type Props = {
    rows: Row[];
    expenses: Expense[];
    startDate: string;
    endDate: string;
    keyMetrics: KeyMetricsData;
    canManage: boolean;
    shares: DashboardShareItem[];
};

export default function AnalyticsDashboard({
    rows,
    expenses,
    startDate,
    endDate,
    keyMetrics,
    canManage,
    shares,
}: Props) {
    const page = usePage();
    const slug = page.props.currentTeam?.slug ?? '';

    const dashboardRef = useRef<HTMLDivElement>(null);
    const [shareOpen, setShareOpen] = useState(false);
    const [downloading, setDownloading] = useState(false);

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

    async function handleDownloadDashboard() {
        if (!dashboardRef.current || downloading) {
            return;
        }

        setDownloading(true);

        try {
            await downloadElementAsPng(dashboardRef.current, 'dashboard');
        } finally {
            setDownloading(false);
        }
    }

    return (
        <>
            <Head title="Analytics" />
            <div className="flex flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-end gap-2">
                    {canManage && (
                        <>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1.5"
                                onClick={handleDownloadDashboard}
                                disabled={downloading}
                            >
                                {downloading ? (
                                    <Loader2Icon className="h-4 w-4 animate-spin" />
                                ) : (
                                    <DownloadIcon className="h-4 w-4" />
                                )}
                                Download
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1.5"
                                onClick={() => setShareOpen(true)}
                            >
                                <Share2Icon className="h-4 w-4" />
                                Share
                            </Button>
                        </>
                    )}
                    <DateRangePicker
                        startDate={startDate}
                        endDate={endDate}
                        onRangeChange={handleRangeChange}
                    />
                </div>

                <div ref={dashboardRef} className="flex flex-col gap-4">
                    {/* Summary cards */}
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                        <KeyMetrics
                            rows={rows}
                            metrics={keyMetrics}
                            weeks={weeks}
                            canDownload={canManage}
                        />
                        <DispatcherChart
                            rows={rows}
                            startDate={startDate}
                            endDate={endDate}
                            canDownload={canManage}
                        />
                        <DispatcherRankings
                            rows={rows}
                            weeks={weeks}
                            canDownload={canManage}
                        />
                    </div>

                    <PnlTable
                        rows={rows}
                        expenses={expenses}
                        title="P&L Report"
                        canDownload={canManage}
                    />
                </div>
            </div>

            {canManage && (
                <ShareDashboardModal
                    open={shareOpen}
                    onOpenChange={setShareOpen}
                    slug={slug}
                    startDate={startDate}
                    endDate={endDate}
                    shares={shares}
                />
            )}
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
