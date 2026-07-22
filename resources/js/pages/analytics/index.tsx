import { Head, router, usePage } from '@inertiajs/react';
import { DownloadIcon, Loader2Icon, Share2Icon } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { index as analyticsIndex } from '@/actions/App/Http/Controllers/Analytics/AnalyticsController';
import { storeDriverConfigAssignment } from '@/actions/App/Http/Controllers/Analytics/ConfigurationController';
import { AddDriverConfigDialog } from '@/components/analytics/add-driver-config-dialog';
import type {
    DialogContractType,
    DialogImportedDriver,
} from '@/components/analytics/add-driver-config-dialog';
import { DispatcherChart } from '@/components/analytics/dispatcher-chart';
import { DispatcherRankings } from '@/components/analytics/dispatcher-rankings';
import { KeyMetrics } from '@/components/analytics/key-metrics';
import type { KeyMetricsData } from '@/components/analytics/key-metrics';
import { PnlTable } from '@/components/analytics/pnl-table';
import type {
    AssignmentContext,
    Expense,
    Row,
} from '@/components/analytics/pnl-table';
import { BasisToggle } from '@/components/basis-toggle';
import { DateRangePicker } from '@/components/date-range-picker';
import { ShareDashboardModal } from '@/components/share-dashboard-modal';
import type { DashboardShareItem } from '@/components/share-dashboard-modal';
import { Button } from '@/components/ui/button';
import { downloadElementAsPng } from '@/lib/download';

type Props = {
    rows: Row[];
    /**
     * Rows split per (driver, dispatcher) for the dispatcher widgets: a driver
     * who changed dispatcher inside the range is attributed week by week, so
     * gross/net land on whoever actually ran each week. Everyone else matches
     * their `rows` entry.
     */
    dispatcherRows: Row[];
    expenses: Expense[];
    startDate: string;
    endDate: string;
    /** Which expense basis the P&L rows were computed on. */
    basis: 'kpi' | 'actual';
    /** Whether the selected range is fully covered by actuals data. */
    actualAvailable: boolean;
    /** [minWeek, maxWeek] of loaded actuals, for the disabled-toggle hint. */
    coveredRange: [string, string] | null;
    /** Name of the Fleet Maintenance expense, or null; drives the fleet Key Metric. */
    fleetExpenseName: string | null;
    keyMetrics: KeyMetricsData;
    canManage: boolean;
    shares: DashboardShareItem[];
    dataSource: 'analytics_db' | 'xlsx';
    contractTypes: DialogContractType[];
    importedDrivers: DialogImportedDriver[];
    takenDriverKeys: string[];
    /** Per-driver truck-assignment context for the inline attach control (TMS). */
    assignmentContext: Record<number, AssignmentContext>;
    /** Monday of the viewed period — effective_from for inline attaches. */
    attachWeek: string;
    /** Normalized units that carry payment/actuals data, for live validation. */
    knownUnits: string[];
};

export default function AnalyticsDashboard({
    rows,
    dispatcherRows,
    expenses,
    startDate,
    endDate,
    basis,
    actualAvailable,
    coveredRange,
    fleetExpenseName,
    keyMetrics,
    canManage,
    shares,
    dataSource,
    contractTypes,
    importedDrivers,
    takenDriverKeys,
    assignmentContext,
    attachWeek,
    knownUnits,
}: Props) {
    const page = usePage();
    const slug = page.props.currentTeam?.slug ?? '';

    const dashboardRef = useRef<HTMLDivElement>(null);
    const [shareOpen, setShareOpen] = useState(false);
    const [downloading, setDownloading] = useState(false);

    // In-place dialog state for the "Configure" button in the PnL table.
    // Opens with a prefill derived from the clicked row so the user just
    // picks contract/rate without re-entering the driver identity.
    const [configureDialogOpen, setConfigureDialogOpen] = useState(false);
    const [configurePrefill, setConfigurePrefill] = useState<{
        external_driver_id?: string;
        external_driver_key?: string;
        driver_name?: string;
        truck?: string;
    } | null>(null);

    const takenKeysSet = useMemo(
        () => new Set(takenDriverKeys),
        [takenDriverKeys],
    );

    function handleConfigureDriver(row: Row) {
        setConfigurePrefill({
            external_driver_id:
                row.external_driver_key == null && row.driver_id != null
                    ? String(row.driver_id)
                    : undefined,
            external_driver_key: row.external_driver_key ?? undefined,
            driver_name: row.driver_name,
            // Seed the truck field with the row's (live TMS) truck so a brand-
            // new config can be born with its unit already attached.
            truck: row.truck_number ?? undefined,
        });
        setConfigureDialogOpen(true);
    }

    function handleConfigureSuccess() {
        // Reload the analytics rows so the newly-configured driver flips
        // from amber "(no config)" to a normal row with salary/PL, and the
        // inline attach control gets its fresh assignment context.
        router.reload({
            only: ['rows', 'keyMetrics', 'takenDriverKeys', 'assignmentContext'],
        });
    }

    // Inline "Attach" from the PnL truck column: write the truck (and optional
    // trailer) as assignments scoped to the VIEWED PERIOD only (effective_from =
    // that week, effective_to = the range end) — a suggested unit shouldn't run
    // on forever, only for the period it was suggested for. Then refresh the rows
    // so the actuals recompute. Writes are chained so both land before the reload.
    function handleAttachUnits(
        configId: number,
        values: { truck: string; trailer: string },
    ) {
        const writes = (
            [
                ['truck', values.truck],
                ['trailer', values.trailer],
            ] as const
        )
            .filter(([, value]) => value.trim() !== '')
            .map(([kind, value]) => ({ kind, value: value.trim() }));

        if (writes.length === 0) {
            return;
        }

        const args: [string, number] = [slug, configId];

        const post = (i: number) => {
            if (i >= writes.length) {
                router.reload({ only: ['rows', 'keyMetrics', 'assignmentContext'] });

                return;
            }

            router[storeDriverConfigAssignment(args).method](
                storeDriverConfigAssignment.url(args),
                {
                    kind: writes[i].kind,
                    value: writes[i].value,
                    effective_from: attachWeek,
                    effective_to: endDate,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } as any,
                {
                    preserveScroll: true,
                    preserveState: true,
                    onSuccess: () => post(i + 1),
                },
            );
        };

        post(0);
    }

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
            { start_date: start, end_date: end, basis },
            { preserveState: true },
        );
    }

    function handleBasisChange(next: 'kpi' | 'actual') {
        if (next === basis) {
            return;
        }

        router.get(
            analyticsIndex.url(slug),
            { start_date: startDate, end_date: endDate, basis: next },
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
                    <BasisToggle
                        basis={basis}
                        actualAvailable={actualAvailable}
                        coveredRange={coveredRange}
                        onChange={handleBasisChange}
                    />
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
                            fleetExpenseName={fleetExpenseName}
                            canDownload={canManage}
                        />
                        <DispatcherChart
                            rows={dispatcherRows}
                            startDate={startDate}
                            endDate={endDate}
                            canDownload={canManage}
                        />
                        <DispatcherRankings
                            rows={dispatcherRows}
                            weeks={weeks}
                            canDownload={canManage}
                        />
                    </div>

                    <PnlTable
                        rows={rows}
                        expenses={expenses}
                        title="P&L Report"
                        canDownload={canManage}
                        onConfigureDriver={
                            canManage ? handleConfigureDriver : undefined
                        }
                        assignmentContext={assignmentContext}
                        attachWeek={attachWeek}
                        knownUnits={knownUnits}
                        onAttachUnits={
                            canManage ? handleAttachUnits : undefined
                        }
                    />
                </div>
            </div>

            {canManage && (
                <>
                    <ShareDashboardModal
                        open={shareOpen}
                        onOpenChange={setShareOpen}
                        slug={slug}
                        startDate={startDate}
                        endDate={endDate}
                        basis={basis}
                        shares={shares}
                    />

                    <AddDriverConfigDialog
                        open={configureDialogOpen}
                        onOpenChange={setConfigureDialogOpen}
                        slug={slug}
                        dataSource={dataSource}
                        contractTypes={contractTypes}
                        importedDrivers={importedDrivers}
                        takenDriverKeys={takenKeysSet}
                        prefill={configurePrefill}
                        onSuccess={handleConfigureSuccess}
                    />
                </>
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
