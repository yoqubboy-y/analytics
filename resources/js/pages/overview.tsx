import { Head, router } from '@inertiajs/react';
import { ArrowUpRight } from 'lucide-react';
import { index as analyticsIndex } from '@/actions/App/Http/Controllers/Analytics/AnalyticsController';
import { index as overviewIndex } from '@/actions/App/Http/Controllers/Analytics/OverviewController';
import { DateRangePicker } from '@/components/date-range-picker';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

type TeamCard = {
    slug: string;
    name: string;
    data_source: 'analytics_db' | 'xlsx';
    gross: number;
    miles: number;
    rpm: number;
    drivers: number;
    configured_drivers: number;
    unconfigured_drivers: number;
    net: number | null;
    utilization: number;
    data_through: string | null;
    is_live: boolean;
};

type Props = {
    startDate: string;
    endDate: string;
    company: {
        teams: number;
        gross: number;
        miles: number;
        drivers: number;
        net: number | null;
        net_partial: boolean;
        utilization: number;
    };
    teams: TeamCard[];
};

const fmtCurrency = (n: number | null) =>
    n === null
        ? '—'
        : `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', {
              maximumFractionDigits: 0,
          })}`;

const fmtNumber = (n: number) => n.toLocaleString('en-US');

const fmtDate = (iso: string) =>
    new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
    });

function utilizationTone(u: number) {
    return u >= 80
        ? 'text-emerald-500'
        : u >= 50
          ? 'text-amber-500'
          : 'text-red-500';
}

function Stat({
    label,
    value,
    hint,
    valueClass,
}: {
    label: string;
    value: string;
    hint?: string;
    valueClass?: string;
}) {
    return (
        <div className="flex flex-col gap-1 rounded-xl border bg-card p-4 shadow-sm">
            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {label}
            </span>
            <span className={cn('text-2xl font-bold tabular-nums', valueClass)}>
                {value}
            </span>
            {hint && (
                <span className="text-xs text-muted-foreground">{hint}</span>
            )}
        </div>
    );
}

export default function Overview({
    startDate,
    endDate,
    company,
    teams,
}: Props) {
    function handleRangeChange(start: string, end: string) {
        router.get(
            overviewIndex.url(),
            { start_date: start, end_date: end },
            { preserveState: true },
        );
    }

    function openTeam(slug: string) {
        // Carry the current range into the team's dashboard.
        router.get(analyticsIndex.url(slug), {
            start_date: startDate,
            end_date: endDate,
        });
    }

    return (
        <>
            <Head title="Company overview" />
            <div className="flex flex-col gap-6 p-4">
                <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                        <h1 className="text-xl font-semibold">
                            Company overview
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Across your {company.teams} teams — pick one to dig
                            in.
                        </p>
                    </div>
                    <DateRangePicker
                        startDate={startDate}
                        endDate={endDate}
                        onRangeChange={handleRangeChange}
                    />
                </div>

                {/* Company scorecard. Net rolls up only configured teams. */}
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
                    <Stat
                        label="Total gross"
                        value={fmtCurrency(company.gross)}
                    />
                    <Stat
                        label="Total net"
                        value={fmtCurrency(company.net)}
                        hint={
                            company.net === null
                                ? 'No configured teams yet'
                                : company.net_partial
                                  ? 'Configured teams only'
                                  : undefined
                        }
                    />
                    <Stat
                        label="Utilization"
                        value={`${company.utilization.toFixed(1)}%`}
                        valueClass={utilizationTone(company.utilization)}
                        hint="Driver-weighted"
                    />
                    <Stat
                        label="Total miles"
                        value={fmtNumber(Math.round(company.miles))}
                    />
                    <Stat
                        label="Drivers"
                        value={fmtNumber(company.drivers)}
                        hint={`${company.teams} teams`}
                    />
                </div>

                <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Team</TableHead>
                                <TableHead>Data</TableHead>
                                <TableHead className="text-right">
                                    Drivers
                                </TableHead>
                                <TableHead className="text-right">
                                    Gross
                                </TableHead>
                                <TableHead className="text-right">
                                    Net
                                </TableHead>
                                <TableHead className="text-right">
                                    RPM
                                </TableHead>
                                <TableHead className="text-right">
                                    Utilization
                                </TableHead>
                                <TableHead />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {teams.map((team) => (
                                <TableRow
                                    key={team.slug}
                                    className="cursor-pointer"
                                    onClick={() => openTeam(team.slug)}
                                >
                                    <TableCell className="font-medium">
                                        {team.name}
                                    </TableCell>
                                    <TableCell>
                                        {team.is_live ? (
                                            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                                <span className="size-1.5 rounded-full bg-emerald-500" />
                                                Live
                                            </span>
                                        ) : team.data_through ? (
                                            <span className="text-xs text-muted-foreground">
                                                through{' '}
                                                {fmtDate(team.data_through)}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">
                                                no data
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {fmtNumber(team.drivers)}
                                        {team.unconfigured_drivers > 0 && (
                                            <span
                                                className="ml-1 text-xs text-amber-500"
                                                title={`${team.unconfigured_drivers} driver(s) without a config`}
                                            >
                                                ({team.unconfigured_drivers}⚠)
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {fmtCurrency(team.gross)}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {team.net === null ? (
                                            <span
                                                className="text-xs text-muted-foreground"
                                                title="No configured drivers — gross only"
                                            >
                                                gross-only
                                            </span>
                                        ) : (
                                            <span
                                                className={cn(
                                                    team.net >= 0
                                                        ? 'text-emerald-500'
                                                        : 'text-red-500',
                                                )}
                                            >
                                                {fmtCurrency(team.net)}
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        ${team.rpm.toFixed(2)}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        <span
                                            className={utilizationTone(
                                                team.utilization,
                                            )}
                                        >
                                            {team.utilization.toFixed(1)}%
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <ArrowUpRight className="ml-auto size-4 text-muted-foreground" />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </>
    );
}

Overview.layout = () => ({
    breadcrumbs: [{ title: 'Overview', href: overviewIndex.url() }],
});
