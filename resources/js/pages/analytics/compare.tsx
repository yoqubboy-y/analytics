import { Head, router } from '@inertiajs/react';
import { useMemo } from 'react';
import { show as compareShow } from '@/actions/App/Http/Controllers/Analytics/AnalyticsComparisonController';
import { DispatcherChart } from '@/components/analytics/dispatcher-chart';
import { DispatcherRankings } from '@/components/analytics/dispatcher-rankings';
import { KeyMetrics } from '@/components/analytics/key-metrics';
import type { KeyMetricsData } from '@/components/analytics/key-metrics';
import { PnlTable } from '@/components/analytics/pnl-table';
import type { Expense, Row } from '@/components/analytics/pnl-table';
import { DateRangePicker } from '@/components/date-range-picker';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

type TeamPayload = {
    slug: string;
    name: string;
    dataSource: 'analytics_db' | 'xlsx';
    rows: Row[];
    keyMetrics: KeyMetricsData;
    expenses: Expense[];
    canManage: boolean;
};

type AvailableTeam = {
    slug: string;
    name: string;
};

type Props = {
    teams: [TeamPayload | null, TeamPayload | null];
    availableTeams: AvailableTeam[];
    startDate: string;
    endDate: string;
};

export default function CompareTeams({
    teams,
    availableTeams,
    startDate,
    endDate,
}: Props) {
    const [teamA, teamB] = teams;

    // Whole weeks in the window — drives per-driver normalisation in the
    // rankings/chart components.
    const weeks = useMemo(() => {
        const start = Date.parse(startDate);
        const end = Date.parse(endDate);
        if (Number.isNaN(start) || Number.isNaN(end)) return 1;
        const days = Math.round((end - start) / 86_400_000) + 1;
        return Math.max(1, days / 7);
    }, [startDate, endDate]);

    function navigate(next: {
        team_a?: string;
        team_b?: string;
        start_date?: string;
        end_date?: string;
    }) {
        router.get(
            compareShow.url(),
            {
                team_a: next.team_a ?? teamA?.slug ?? '',
                team_b: next.team_b ?? teamB?.slug ?? '',
                start_date: next.start_date ?? startDate,
                end_date: next.end_date ?? endDate,
            },
            { preserveState: true },
        );
    }

    return (
        <>
            <Head title="Compare teams" />
            <div className="flex flex-col gap-4 p-4">
                {/* Header: team pickers + shared date range */}
                <div className="flex flex-wrap items-end justify-between gap-2">
                    <div className="flex flex-wrap items-end gap-2">
                        <TeamPicker
                            label="Team A"
                            value={teamA?.slug ?? ''}
                            options={availableTeams}
                            disabledSlug={teamB?.slug ?? null}
                            onChange={(slug) => navigate({ team_a: slug })}
                        />
                        <span className="px-1 pb-2 text-sm font-semibold text-muted-foreground">
                            vs
                        </span>
                        <TeamPicker
                            label="Team B"
                            value={teamB?.slug ?? ''}
                            options={availableTeams}
                            disabledSlug={teamA?.slug ?? null}
                            onChange={(slug) => navigate({ team_b: slug })}
                        />
                    </div>
                    <DateRangePicker
                        startDate={startDate}
                        endDate={endDate}
                        onRangeChange={(s, e) =>
                            navigate({ start_date: s, end_date: e })
                        }
                    />
                </div>

                {/* Side-by-side dashboards */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <TeamColumn
                        team={teamA}
                        startDate={startDate}
                        endDate={endDate}
                        weeks={weeks}
                    />
                    <TeamColumn
                        team={teamB}
                        startDate={startDate}
                        endDate={endDate}
                        weeks={weeks}
                    />
                </div>
            </div>
        </>
    );
}

CompareTeams.layout = () => ({
    breadcrumbs: [{ title: 'Compare teams', href: compareShow.url() }],
});

interface TeamPickerProps {
    label: string;
    value: string;
    options: AvailableTeam[];
    disabledSlug: string | null;
    onChange: (slug: string) => void;
}

function TeamPicker({
    label,
    value,
    options,
    disabledSlug,
    onChange,
}: TeamPickerProps) {
    return (
        <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {label}
            </span>
            <Select value={value} onValueChange={onChange}>
                <SelectTrigger className="h-8 w-60 text-sm">
                    <SelectValue placeholder="Pick a team…" />
                </SelectTrigger>
                <SelectContent>
                    {options.map((opt) => (
                        <SelectItem
                            key={opt.slug}
                            value={opt.slug}
                            disabled={opt.slug === disabledSlug}
                        >
                            {opt.name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}

function TeamColumn({
    team,
    startDate,
    endDate,
    weeks,
}: {
    team: TeamPayload | null;
    startDate: string;
    endDate: string;
    weeks: number;
}) {
    if (!team) {
        return (
            <div className="flex min-h-[480px] flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 text-sm text-muted-foreground">
                Pick a team to compare.
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2 border-b pb-2">
                <h2 className="text-lg font-semibold">{team.name}</h2>
                <span className="rounded-full border bg-muted/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {team.dataSource === 'xlsx'
                        ? 'XLSX upload'
                        : 'Analytics DB'}
                </span>
            </div>

            <div className="grid grid-cols-1 gap-4">
                <KeyMetrics
                    rows={team.rows}
                    metrics={team.keyMetrics}
                    weeks={weeks}
                    canDownload={false}
                />
                <DispatcherChart
                    rows={team.rows}
                    startDate={startDate}
                    endDate={endDate}
                    canDownload={false}
                />
                <DispatcherRankings
                    rows={team.rows}
                    weeks={weeks}
                    canDownload={false}
                />
            </div>

            <PnlTable
                rows={team.rows}
                expenses={team.expenses}
                title="P&L"
                canDownload={false}
                /* onConfigureDriver intentionally omitted — the in-place
                   driver-config dialog lives on the per-team analytics page,
                   not in the compare view (rows here span two teams). */
            />
        </div>
    );
}
