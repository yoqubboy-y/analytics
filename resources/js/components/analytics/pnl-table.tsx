import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationNext,
    PaginationPrevious,
} from '@/components/ui/pagination';

export type Row = {
    driver_id: number | null;
    driver_name: string;
    dispatcher: string;
    truck_number: string | null;
    type: string | null;
    days: number;
    total_gross: number;
    total_miles: number;
    rpm: number;
    salary: number | null;
    expenses: Record<string, number>;
    total_expenses: number | null;
    profit_loss: number | null;
    missing_config: boolean;
    is_total: boolean;
};

export type Expense = {
    id: number;
    name: string;
    calculation_type: string;
};

const fmt = (n: number | null, prefix = '') =>
    n == null
        ? '—'
        : `${prefix}${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtInt = (n: number) => n.toLocaleString('en-US');

const PAGE_SIZE_OPTIONS = [10, 15, 25, 50, 100];

function SortIcon({ sorted }: { sorted: false | 'asc' | 'desc' }) {
    if (sorted === 'asc')
        return <ArrowUpIcon className="ml-1 inline h-3 w-3" />;
    if (sorted === 'desc')
        return <ArrowDownIcon className="ml-1 inline h-3 w-3" />;
    return <ChevronsUpDownIcon className="ml-1 inline h-3 w-3 opacity-40" />;
}

type SortKey = keyof Row | `expense_${string}`;
type SortDir = 'asc' | 'desc';

interface PnlTableProps {
    rows: Row[];
    expenses: Expense[];
}

export function PnlTable({ rows, expenses }: PnlTableProps) {
    const [sortKey, setSortKey] = useState<SortKey | null>(null);
    const [sortDir, setSortDir] = useState<SortDir>('asc');
    const [driverFilter, setDriverFilter] = useState('');
    const [dispatcherFilter, setDispatcherFilter] = useState('all');
    const [typeFilter, setTypeFilter] = useState('all');
    const [truckFilter, setTruckFilter] = useState('all');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(15);

    const dispatchers = useMemo(
        () => [
            'all',
            ...Array.from(
                new Set(
                    rows
                        .filter((r) => !r.is_total && r.dispatcher)
                        .map((r) => r.dispatcher),
                ),
            ).sort(),
        ],
        [rows],
    );

    const contractTypes = useMemo(
        () => [
            'all',
            ...Array.from(
                new Set(
                    rows
                        .filter((r) => !r.is_total && r.type)
                        .map((r) => r.type as string),
                ),
            ).sort(),
        ],
        [rows],
    );

    const trucks = useMemo(
        () => [
            'all',
            ...Array.from(
                new Set(
                    rows
                        .filter((r) => !r.is_total && r.truck_number)
                        .map((r) => r.truck_number as string),
                ),
            ).sort(),
        ],
        [rows],
    );

    function toggleSort(key: SortKey) {
        if (sortKey === key) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    }

    function getVal(row: Row, key: SortKey): string | number | null {
        if (key.startsWith('expense_')) {
            const name = key.slice('expense_'.length);
            return row.expenses[name] ?? null;
        }
        return row[key as keyof Row] as string | number | null;
    }

    const totalRow = useMemo(
        () => rows.find((r) => r.is_total) ?? null,
        [rows],
    );

    const displayRows = useMemo(() => {
        let data = rows.filter((r) => !r.is_total);

        if (driverFilter) {
            const q = driverFilter.toLowerCase();
            data = data.filter((r) => r.driver_name.toLowerCase().includes(q));
        }
        if (dispatcherFilter !== 'all') {
            data = data.filter((r) => r.dispatcher === dispatcherFilter);
        }
        if (typeFilter !== 'all') {
            data = data.filter((r) => r.type === typeFilter);
        }
        if (truckFilter !== 'all') {
            data = data.filter((r) => r.truck_number === truckFilter);
        }

        if (sortKey) {
            data = [...data].sort((a, b) => {
                const av = getVal(a, sortKey);
                const bv = getVal(b, sortKey);
                if (av == null && bv == null) return 0;
                if (av == null) return 1;
                if (bv == null) return -1;
                const cmp =
                    typeof av === 'string'
                        ? av.localeCompare(bv as string)
                        : (av as number) - (bv as number);
                return sortDir === 'asc' ? cmp : -cmp;
            });
        }

        return data;
    }, [
        rows,
        driverFilter,
        dispatcherFilter,
        typeFilter,
        truckFilter,
        sortKey,
        sortDir,
    ]);

    useEffect(() => {
        setPage(1);
    }, [driverFilter, dispatcherFilter, typeFilter, truckFilter, sortKey]);

    const SortIcon = ({ col }: { col: SortKey }) => {
        if (sortKey !== col)
            return (
                <ChevronsUpDownIcon className="ml-1 inline h-3 w-3 opacity-40" />
            );
        return sortDir === 'asc' ? (
            <ArrowUpIcon className="ml-1 inline h-3 w-3" />
        ) : (
            <ArrowDownIcon className="ml-1 inline h-3 w-3" />
        );
    };

    const Th = ({
        col,
        children,
    }: {
        col: SortKey;
        children: React.ReactNode;
    }) => (
        <TableHead
            className="cursor-pointer px-3 py-2 text-xs whitespace-nowrap select-none"
            onClick={() => toggleSort(col)}
        >
            {children}
            <SortIcon col={col} />
        </TableHead>
    );

    const pageCount = Math.ceil(displayRows.length / pageSize);
    const pagedRows = displayRows.slice((page - 1) * pageSize, page * pageSize);

    return (
        <div className="flex flex-col gap-3">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
                <Input
                    placeholder="Search driver…"
                    value={driverFilter}
                    onChange={(e) => setDriverFilter(e.target.value)}
                    className="h-8 w-44"
                />
                <Select
                    value={dispatcherFilter}
                    onValueChange={setDispatcherFilter}
                >
                    <SelectTrigger className="h-8 w-44">
                        <SelectValue placeholder="Dispatcher" />
                    </SelectTrigger>
                    <SelectContent>
                        {dispatchers.map((d) => (
                            <SelectItem key={d} value={d}>
                                {d === 'all' ? 'All dispatchers' : d}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="h-8 w-36">
                        <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                        {contractTypes.map((t) => (
                            <SelectItem key={t} value={t}>
                                {t === 'all' ? 'All types' : t}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={truckFilter} onValueChange={setTruckFilter}>
                    <SelectTrigger className="h-8 w-36">
                        <SelectValue placeholder="Truck" />
                    </SelectTrigger>
                    <SelectContent>
                        {trucks.map((t) => (
                            <SelectItem key={t} value={t}>
                                {t === 'all' ? 'All trucks' : t}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-lg border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <Th col="driver_name">Driver</Th>
                            <Th col="dispatcher">Dispatcher</Th>
                            <TableHead className="px-3 py-2 text-xs whitespace-nowrap">
                                Truck
                            </TableHead>
                            <Th col="type">Type</Th>
                            <Th col="days">Days</Th>
                            <Th col="total_gross">Gross</Th>
                            <Th col="total_miles">Miles</Th>
                            <Th col="rpm">RPM</Th>
                            <Th col="salary">Salary</Th>
                            {expenses.map((e) => (
                                <Th key={e.id} col={`expense_${e.name}`}>
                                    {e.name}
                                </Th>
                            ))}
                            <Th col="total_expenses">Total Exp.</Th>
                            <Th col="profit_loss">P&amp;L</Th>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {pagedRows.map((row) => (
                            <TableRow
                                key={row.driver_id ?? row.driver_name}
                                className={
                                    row.missing_config
                                        ? 'bg-amber-50 dark:bg-amber-950/20'
                                        : ''
                                }
                            >
                                <TableCell className="px-3 py-2 text-sm whitespace-nowrap">
                                    <span
                                        className={
                                            row.missing_config
                                                ? 'font-medium text-amber-600'
                                                : ''
                                        }
                                    >
                                        {row.driver_name}
                                        {row.missing_config && (
                                            <span className="ml-1 text-xs text-amber-500">
                                                (no config)
                                            </span>
                                        )}
                                    </span>
                                </TableCell>
                                <TableCell className="px-3 py-2 text-sm whitespace-nowrap">
                                    {row.dispatcher}
                                </TableCell>
                                <TableCell className="px-3 py-2 text-sm whitespace-nowrap">
                                    {row.truck_number ?? '—'}
                                </TableCell>
                                <TableCell className="px-3 py-2 text-sm whitespace-nowrap">
                                    {row.type ?? '—'}
                                </TableCell>
                                <TableCell className="px-3 py-2 text-sm whitespace-nowrap tabular-nums">
                                    {fmtInt(row.days)}
                                </TableCell>
                                <TableCell className="px-3 py-2 text-sm whitespace-nowrap tabular-nums">
                                    {fmt(row.total_gross, '$')}
                                </TableCell>
                                <TableCell className="px-3 py-2 text-sm whitespace-nowrap tabular-nums">
                                    {fmtInt(row.total_miles)}
                                </TableCell>
                                <TableCell className="px-3 py-2 text-sm whitespace-nowrap tabular-nums">
                                    {fmt(row.rpm, '$')}
                                </TableCell>
                                <TableCell className="px-3 py-2 text-sm whitespace-nowrap tabular-nums">
                                    {fmt(row.salary, '$')}
                                </TableCell>
                                {expenses.map((e) => (
                                    <TableCell
                                        key={e.id}
                                        className="px-3 py-2 text-sm whitespace-nowrap tabular-nums"
                                    >
                                        {fmt(row.expenses[e.name] ?? null, '$')}
                                    </TableCell>
                                ))}
                                <TableCell className="px-3 py-2 text-sm whitespace-nowrap tabular-nums">
                                    {fmt(row.total_expenses, '$')}
                                </TableCell>
                                <TableCell className="px-3 py-2 text-sm whitespace-nowrap">
                                    <span
                                        className={`font-semibold tabular-nums ${row.profit_loss != null && row.profit_loss < 0 ? 'text-red-600' : 'text-green-700'}`}
                                    >
                                        {fmt(row.profit_loss, '$')}
                                    </span>
                                </TableCell>
                            </TableRow>
                        ))}

                        {/* Pinned totals row */}
                        {totalRow && (
                            <TableRow className="bg-muted font-bold">
                                <TableCell className="px-3 py-2 text-sm whitespace-nowrap">
                                    {totalRow.driver_name}
                                </TableCell>
                                <TableCell className="px-3 py-2 text-sm whitespace-nowrap" />
                                <TableCell className="px-3 py-2 text-sm whitespace-nowrap" />
                                <TableCell className="px-3 py-2 text-sm whitespace-nowrap" />
                                <TableCell className="px-3 py-2 text-sm whitespace-nowrap tabular-nums">
                                    {fmtInt(totalRow.days)}
                                </TableCell>
                                <TableCell className="px-3 py-2 text-sm whitespace-nowrap tabular-nums">
                                    {fmt(totalRow.total_gross, '$')}
                                </TableCell>
                                <TableCell className="px-3 py-2 text-sm whitespace-nowrap tabular-nums">
                                    {fmtInt(totalRow.total_miles)}
                                </TableCell>
                                <TableCell className="px-3 py-2 text-sm whitespace-nowrap tabular-nums">
                                    {fmt(totalRow.rpm, '$')}
                                </TableCell>
                                <TableCell className="px-3 py-2 text-sm whitespace-nowrap tabular-nums">
                                    {fmt(totalRow.salary, '$')}
                                </TableCell>
                                {expenses.map((e) => (
                                    <TableCell
                                        key={e.id}
                                        className="px-3 py-2 text-sm whitespace-nowrap tabular-nums"
                                    >
                                        {fmt(
                                            totalRow.expenses[e.name] ?? null,
                                            '$',
                                        )}
                                    </TableCell>
                                ))}
                                <TableCell className="px-3 py-2 text-sm whitespace-nowrap tabular-nums">
                                    {fmt(totalRow.total_expenses, '$')}
                                </TableCell>
                                <TableCell className="px-3 py-2 text-sm whitespace-nowrap">
                                    <span
                                        className={`font-semibold tabular-nums ${totalRow.profit_loss != null && totalRow.profit_loss < 0 ? 'text-red-600' : 'text-green-700'}`}
                                    >
                                        {fmt(totalRow.profit_loss, '$')}
                                    </span>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Rows per page</span>
                    <Select
                        value={String(pageSize)}
                        onValueChange={(v) => setPageSize(Number(v))}
                    >
                        <SelectTrigger className="h-7 w-16">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {PAGE_SIZE_OPTIONS.map((n) => (
                                <SelectItem key={n} value={String(n)}>
                                    {n}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {pageCount > 1 && (
                    <Pagination className="flex-1 justify-start">
                        <PaginationContent>
                            <PaginationItem>
                                <PaginationPrevious
                                    onClick={() =>
                                        setPage((p) => Math.max(1, p - 1))
                                    }
                                    className={
                                        page <= 1
                                            ? 'pointer-events-none opacity-50'
                                            : 'cursor-pointer'
                                    }
                                />
                            </PaginationItem>
                            <PaginationItem>
                                <span className="px-3 py-2 text-sm text-muted-foreground">
                                    {(page - 1) * pageSize + 1}–
                                    {Math.min(
                                        page * pageSize,
                                        displayRows.length,
                                    )}{' '}
                                    of {displayRows.length} drivers
                                </span>
                            </PaginationItem>
                            <PaginationItem>
                                <PaginationNext
                                    onClick={() =>
                                        setPage((p) =>
                                            Math.min(pageCount, p + 1),
                                        )
                                    }
                                    className={
                                        page >= pageCount
                                            ? 'pointer-events-none opacity-50'
                                            : 'cursor-pointer'
                                    }
                                />
                            </PaginationItem>
                        </PaginationContent>
                    </Pagination>
                )}
            </div>
        </div>
    );
}
