import {
    flexRender,
    getCoreRowModel,
    getSortedRowModel,
    useReactTable,
} from '@tanstack/react-table';
import type {
    ColumnDef,
    ColumnSizingState,
    SortingState,
} from '@tanstack/react-table';
import {
    ArrowDownIcon,
    ArrowUpIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    ChevronsUpDownIcon,
    DownloadIcon,
    EyeIcon,
    EyeOffIcon,
    FilterIcon,
    ImageIcon,
    PlusIcon,
    SearchIcon,
    Settings2Icon,
    XIcon,
} from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import type React from 'react';
import * as XLSX from 'xlsx';
import MultipleSelector from '@/components/ui/multiselect';
import type { Option } from '@/components/ui/multiselect';
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationNext,
    PaginationPrevious,
} from '@/components/ui/pagination';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
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
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { downloadElementAsPng } from '@/lib/download';
import { cn } from '@/lib/utils';

export type Row = {
    driver_id: number | null;
    /**
     * Set on XLSX-backed teams only — same identity string the analytics
     * service uses to key driver configs. The PnL table forwards it to the
     * Configure deep-link so the dialog opens with the right driver picked.
     */
    external_driver_key?: string | null;
    driver_name: string;
    dispatcher: string;
    truck_number: string | null;
    type: string | null;
    days: number;
    /**
     * Distinct days this driver spent in a productive event status
     * (TRANSIT / ENROUTE). Added to `days` when widgets compute per-
     * dispatcher utilization so it matches KeyMetrics' compound rate.
     */
    productive_event_days?: number;
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
    /** Optional note shown as a tooltip on the column header. */
    description?: string | null;
    calculation_type: string;
};

// Expense column header: shows the name, plus a hover tooltip with the
// description when one is configured (dotted underline hints it's there).
function ExpenseHeader({
    name,
    description,
}: {
    name: string;
    description: string;
}) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span className="truncate underline decoration-dotted decoration-muted-foreground/60 underline-offset-2">
                    {name}
                </span>
            </TooltipTrigger>
            <TooltipContent>{description}</TooltipContent>
        </Tooltip>
    );
}

// Negative values get the sign outside the prefix so a driver-paid expense
// reads "-$250.00" instead of "$-250.00".
const fmt = (n: number | null, prefix = '') => {
    if (n == null) return '—';
    const abs = Math.abs(n).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    return n < 0 ? `-${prefix}${abs}` : `${prefix}${abs}`;
};

const fmtInt = (n: number) => n.toLocaleString('en-US');

const PAGE_SIZE_OPTIONS = [10, 15, 25, 50, 100];

// Simple column header with click-to-sort and drag-to-resize (DOM-only during drag)
function ColHead({
    id,
    size,
    isSorted,
    canSort,
    onSort,
    onResize,
    children,
}: {
    id: string;
    size: number;
    isSorted: false | 'asc' | 'desc';
    canSort: boolean;
    onSort: () => void;
    onResize: (id: string, size: number) => void;
    children: React.ReactNode;
}) {
    const thRef = useRef<HTMLTableCellElement | null>(null);
    const startX = useRef(0);
    const startSize = useRef(0);
    const currentSize = useRef(size);
    const dragging = useRef(false);

    const onResizeMouseDown = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            dragging.current = true;
            startX.current = e.clientX;
            startSize.current = thRef.current
                ? thRef.current.offsetWidth
                : size;
            currentSize.current = startSize.current;

            function onMove(ev: MouseEvent) {
                if (!dragging.current) {
                    return;
                }

                const next = Math.max(
                    60,
                    startSize.current + ev.clientX - startX.current,
                );
                currentSize.current = next;

                if (thRef.current) {
                    thRef.current.style.width = `${next}px`;
                    thRef.current.style.minWidth = `${next}px`;
                }
            }
            function onUp() {
                dragging.current = false;
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                onResize(id, currentSize.current);
            }
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        },
        [id, size, onResize],
    );

    return (
        <TableHead
            ref={thRef}
            style={{ width: size, minWidth: size, position: 'relative' }}
            className="group px-2 py-2 text-xs whitespace-nowrap select-none"
        >
            <div className="flex items-center gap-0.5">
                <span
                    className={cn(
                        'flex items-center gap-0.5 truncate',
                        canSort && 'cursor-pointer',
                    )}
                    onClick={canSort ? onSort : undefined}
                >
                    {children}
                    {canSort &&
                        (isSorted === 'asc' ? (
                            <ArrowUpIcon className="h-3 w-3 shrink-0" />
                        ) : isSorted === 'desc' ? (
                            <ArrowDownIcon className="h-3 w-3 shrink-0" />
                        ) : (
                            <ChevronsUpDownIcon className="h-3 w-3 shrink-0 opacity-30" />
                        ))}
                </span>
            </div>
            <div
                onMouseDown={onResizeMouseDown}
                className="absolute top-0 right-0 z-10 h-full w-1 cursor-col-resize opacity-0 group-hover:opacity-100 hover:bg-border"
            />
        </TableHead>
    );
}

interface PnlTableProps {
    rows: Row[];
    expenses: Expense[];
    title?: string;
    /** Show the export/download options (hidden for viewers). */
    canDownload?: boolean;
    /**
     * Invoked when the user clicks "Configure" next to a missing-config
     * row. The parent renders the Add Driver Config dialog in-place so the
     * user stays on the analytics page. Omit to hide the button entirely.
     */
    onConfigureDriver?: (row: Row) => void;
}

export function PnlTable({
    rows,
    expenses,
    title,
    canDownload = true,
    onConfigureDriver,
}: PnlTableProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [driverFilter, setDriverFilter] = useState('');
    const [dispatcherFilter, setDispatcherFilter] = useState<Option[]>([]);
    const [typeFilter, setTypeFilter] = useState<Option[]>([]);
    const [truckFilter, setTruckFilter] = useState<Option[]>([]);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(15);
    const [sorting, setSorting] = useState<SortingState>([]);
    const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
    const [columnVisibility, setColumnVisibility] = useState<
        Record<string, boolean>
    >({});

    const dispatchers = useMemo(
        () =>
            [
                ...new Set(
                    rows
                        .filter((r) => !r.is_total && r.dispatcher)
                        .map((r) => r.dispatcher),
                ),
            ].sort(),
        [rows],
    );
    const contractTypes = useMemo(
        () =>
            [
                ...new Set(
                    rows
                        .filter((r) => !r.is_total && r.type)
                        .map((r) => r.type as string),
                ),
            ].sort(),
        [rows],
    );
    const trucks = useMemo(
        () =>
            [
                ...new Set(
                    rows
                        .filter((r) => !r.is_total && r.truck_number)
                        .map((r) => r.truck_number as string),
                ),
            ].sort(),
        [rows],
    );

    const displayRows = useMemo(() => {
        let data = rows.filter((r) => !r.is_total);

        if (driverFilter) {
            const q = driverFilter.toLowerCase();
            data = data.filter((r) => r.driver_name.toLowerCase().includes(q));
        }

        if (dispatcherFilter.length > 0) {
            data = data.filter((r) =>
                dispatcherFilter.some((o) => o.value === r.dispatcher),
            );
        }

        if (typeFilter.length > 0) {
            data = data.filter((r) =>
                typeFilter.some((o) => o.value === (r.type ?? '')),
            );
        }

        if (truckFilter.length > 0) {
            data = data.filter((r) =>
                truckFilter.some((o) => o.value === (r.truck_number ?? '')),
            );
        }

        return data;
    }, [rows, driverFilter, dispatcherFilter, typeFilter, truckFilter]);

    const totalRow = useMemo<Row | null>(() => {
        if (displayRows.length === 0) {
            return null;
        }

        const configured = displayRows.filter((r) => !r.missing_config);
        const totalGross = configured.reduce((s, r) => s + r.total_gross, 0);
        const totalMiles = configured.reduce((s, r) => s + r.total_miles, 0);
        const expenseSums: Record<string, number> = {};

        for (const e of expenses) {
            expenseSums[e.name] = configured.reduce(
                (s, r) => s + (r.expenses[e.name] ?? 0),
                0,
            );
        }

        const totalSalary = configured.reduce(
            (s, r) => s + (r.salary ?? 0),
            0,
        );

        return {
            driver_id: null,
            driver_name: 'TOTAL',
            dispatcher: '',
            truck_number: '',
            type: '',
            days: displayRows.reduce((s, r) => s + r.days, 0),
            total_gross: totalGross,
            total_miles: totalMiles,
            rpm: totalMiles > 0 ? totalGross / totalMiles : 0,
            salary: totalSalary,
            expenses: expenseSums,
            // Sum per-row carrier-net Total Exp. directly so driver-paid
            // pass-throughs (which still appear as -$X cells on each row)
            // stay out of the math — they're cost-neutral to the carrier.
            total_expenses: configured.reduce(
                (s, r) => s + (r.total_expenses ?? 0),
                0,
            ),
            profit_loss: configured.reduce(
                (s, r) => s + (r.profit_loss ?? 0),
                0,
            ),
            missing_config: false,
            is_total: true,
        };
    }, [displayRows, expenses]);

    const pageCount = Math.ceil(displayRows.length / pageSize);
    const pagedRows = useMemo(
        () => displayRows.slice((page - 1) * pageSize, page * pageSize),
        [displayRows, page, pageSize],
    );

    const columns = useMemo<ColumnDef<Row>[]>(
        () => [
            {
                id: 'driver_name',
                accessorKey: 'driver_name',
                header: 'Driver',
                size: 180,
                minSize: 100,
            },
            {
                id: 'dispatcher',
                accessorKey: 'dispatcher',
                header: 'Dispatcher',
                size: 130,
                minSize: 80,
            },
            {
                id: 'truck_number',
                accessorKey: 'truck_number',
                header: 'Truck',
                size: 90,
                minSize: 60,
                enableSorting: false,
            },
            {
                id: 'type',
                accessorKey: 'type',
                header: 'Type',
                size: 70,
                minSize: 50,
            },
            {
                id: 'days',
                accessorKey: 'days',
                header: 'Days',
                size: 65,
                minSize: 50,
            },
            {
                id: 'total_gross',
                accessorKey: 'total_gross',
                header: 'Gross',
                size: 110,
                minSize: 70,
            },
            {
                id: 'total_miles',
                accessorKey: 'total_miles',
                header: 'Miles',
                size: 90,
                minSize: 70,
            },
            {
                id: 'rpm',
                accessorKey: 'rpm',
                header: 'RPM',
                size: 80,
                minSize: 60,
            },
            {
                id: 'salary',
                accessorKey: 'salary',
                header: 'Salary',
                size: 110,
                minSize: 70,
            },
            ...expenses.map(
                (e): ColumnDef<Row> => ({
                    id: `expense_${e.name}`,
                    header: e.description
                        ? () => (
                              <ExpenseHeader
                                  name={e.name}
                                  description={e.description as string}
                              />
                          )
                        : e.name,
                    size: 110,
                    minSize: 70,
                    accessorFn: (row) => row.expenses[e.name] ?? null,
                }),
            ),
            {
                id: 'total_expenses',
                accessorKey: 'total_expenses',
                header: 'Total Exp.',
                size: 110,
                minSize: 70,
            },
            {
                id: 'profit_loss',
                accessorKey: 'profit_loss',
                header: 'P&L',
                size: 110,
                minSize: 70,
            },
        ],
        [expenses],
    );

    const table = useReactTable({
        data: pagedRows,
        columns,
        state: { sorting, columnSizing, columnVisibility },
        onSortingChange: (updater) => {
            setSorting(updater);
            setPage(1);
        },
        onColumnSizingChange: setColumnSizing,
        onColumnVisibilityChange: setColumnVisibility,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        columnResizeMode: 'onChange',
    });

    const handleResize = useCallback((id: string, size: number) => {
        setColumnSizing((prev) => ({ ...prev, [id]: size }));
    }, []);

    const visibleHeaders =
        table
            .getHeaderGroups()[0]
            ?.headers.filter((h) => h.column.getIsVisible()) ?? [];

    function renderCell(row: Row, colId: string) {
        if (colId === 'driver_name') {
            return (
                <span
                    className={
                        row.missing_config ? 'font-medium text-amber-600' : ''
                    }
                >
                    {row.driver_name}
                    {row.missing_config && (
                        <>
                            <span className="ml-1 text-xs text-amber-500">
                                (no config)
                            </span>
                            {onConfigureDriver && (
                                <button
                                    type="button"
                                    onClick={() => onConfigureDriver(row)}
                                    className="ml-1.5 inline-flex items-center gap-0.5 rounded border border-amber-500/40 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 transition-colors hover:bg-amber-500/10"
                                >
                                    <PlusIcon className="h-3 w-3" />
                                    Configure
                                </button>
                            )}
                        </>
                    )}
                </span>
            );
        }

        if (colId === 'dispatcher') {
            return row.dispatcher;
        }

        if (colId === 'truck_number') {
            return row.truck_number ?? '—';
        }

        if (colId === 'type') {
            return row.type ?? '—';
        }

        if (colId === 'days') {
            return fmtInt(row.days);
        }

        if (colId === 'total_gross') {
            return fmt(row.total_gross, '$');
        }

        if (colId === 'total_miles') {
            return fmtInt(row.total_miles);
        }

        if (colId === 'rpm') {
            return fmt(row.rpm, '$');
        }

        if (colId === 'salary') {
            return fmt(row.salary, '$');
        }

        if (colId === 'total_expenses') {
            return fmt(row.total_expenses, '$');
        }

        if (colId === 'profit_loss') {
            return (
                <span
                    className={cn(
                        'font-semibold tabular-nums',
                        row.profit_loss != null && row.profit_loss < 0
                            ? 'text-red-600'
                            : 'text-green-700',
                    )}
                >
                    {fmt(row.profit_loss, '$')}
                </span>
            );
        }

        if (colId.startsWith('expense_')) {
            return fmt(
                row.expenses[colId.slice('expense_'.length)] ?? null,
                '$',
            );
        }

        return null;
    }

    function renderTotalCell(colId: string) {
        if (!totalRow) {
            return null;
        }

        if (colId === 'driver_name') {
            return totalRow.driver_name;
        }

        if (colId === 'days') {
            return fmtInt(totalRow.days);
        }

        if (colId === 'total_gross') {
            return fmt(totalRow.total_gross, '$');
        }

        if (colId === 'total_miles') {
            return fmtInt(totalRow.total_miles);
        }

        if (colId === 'rpm') {
            return fmt(totalRow.rpm, '$');
        }

        if (colId === 'salary') {
            return fmt(totalRow.salary, '$');
        }

        if (colId === 'total_expenses') {
            return fmt(totalRow.total_expenses, '$');
        }

        if (colId === 'profit_loss') {
            return (
                <span
                    className={cn(
                        'font-semibold tabular-nums',
                        totalRow.profit_loss != null && totalRow.profit_loss < 0
                            ? 'text-red-600'
                            : 'text-green-700',
                    )}
                >
                    {fmt(totalRow.profit_loss, '$')}
                </span>
            );
        }

        if (colId.startsWith('expense_')) {
            return fmt(
                totalRow.expenses[colId.slice('expense_'.length)] ?? null,
                '$',
            );
        }

        return null;
    }

    const activeFilterCount = [
        driverFilter !== '',
        dispatcherFilter.length > 0,
        typeFilter.length > 0,
        truckFilter.length > 0,
    ].filter(Boolean).length;

    const clearFilters = () => {
        setDriverFilter('');
        setDispatcherFilter([]);
        setTypeFilter([]);
        setTruckFilter([]);
        setPage(1);
    };

    const allLeafColumns = table.getAllLeafColumns();

    const handleExport = useCallback(() => {
        const headers = [
            'Driver',
            'Dispatcher',
            'Truck',
            'Type',
            'Days',
            'Gross',
            'Miles',
            'RPM',
            'Salary',
            ...expenses.map((e) => e.name),
            'Total Expenses',
            'P&L',
        ];

        const driverData = rows
            .filter((r) => !r.is_total)
            .map((r) => [
                r.driver_name,
                r.dispatcher,
                r.truck_number ?? '',
                r.type ?? '',
                r.days,
                r.total_gross,
                r.total_miles,
                r.rpm,
                r.salary ?? 0,
                ...expenses.map((e) => r.expenses[e.name] ?? 0),
                r.total_expenses ?? 0,
                r.profit_loss ?? 0,
            ]);

        const totalRowArr = totalRow
            ? [
                  [
                      'TOTAL',
                      '',
                      '',
                      '',
                      totalRow.days,
                      totalRow.total_gross,
                      totalRow.total_miles,
                      totalRow.rpm,
                      totalRow.salary ?? 0,
                      ...expenses.map((e) => totalRow.expenses[e.name] ?? 0),
                      totalRow.total_expenses ?? 0,
                      totalRow.profit_loss ?? 0,
                  ],
              ]
            : [];

        const ws = XLSX.utils.aoa_to_sheet([
            headers,
            ...driverData,
            ...totalRowArr,
        ]);

        // Column widths
        ws['!cols'] = headers.map((h) => ({ wch: Math.max(12, h.length + 2) }));

        // Number format for currency/numeric columns (skip first 4 string cols)
        const range = XLSX.utils.decode_range(ws['!ref'] as string);

        for (let R = 1; R <= range.e.r; ++R) {
            for (let C = 4; C <= range.e.c; ++C) {
                const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
                const cell = ws[cellRef];

                if (!cell || typeof cell.v !== 'number') {
                    continue;
                }

                cell.t = 'n';

                // Days, Miles -> integer; everything else -> currency
                if (C === 4 || C === 6) {
                    cell.z = '#,##0';
                } else {
                    cell.z = '$#,##0.00';
                }
            }
        }

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'P&L Report');

        const ts = new Date()
            .toISOString()
            .slice(0, 19)
            .replace('T', '_')
            .replaceAll(':', '-');
        XLSX.writeFile(wb, `pnl-report-${ts}.xlsx`);
    }, [rows, expenses, totalRow]);

    const handleDownloadImage = useCallback(() => {
        if (containerRef.current) {
            void downloadElementAsPng(containerRef.current, 'pnl-report');
        }
    }, []);

    return (
        <div ref={containerRef} className="flex flex-col gap-3">
            {/* Toolbar */}
            <div className="flex items-center justify-between gap-2">
                {title && <h1 className="text-xl font-semibold">{title}</h1>}
                <div className="flex items-center gap-2">
                    <SettingsPopover
                        activeFilterCount={activeFilterCount}
                        canDownload={canDownload}
                        onExport={handleExport}
                        onDownloadImage={handleDownloadImage}
                        // visibility props
                        columns={allLeafColumns}
                        columnVisibility={columnVisibility}
                        setColumnVisibility={setColumnVisibility}
                        // filter props
                        driverFilter={driverFilter}
                        setDriverFilter={(v) => {
                            setDriverFilter(v);
                            setPage(1);
                        }}
                        dispatchers={dispatchers}
                        dispatcherFilter={dispatcherFilter}
                        setDispatcherFilter={(v) => {
                            setDispatcherFilter(v);
                            setPage(1);
                        }}
                        contractTypes={contractTypes}
                        typeFilter={typeFilter}
                        setTypeFilter={(v) => {
                            setTypeFilter(v);
                            setPage(1);
                        }}
                        trucks={trucks}
                        truckFilter={truckFilter}
                        setTruckFilter={(v) => {
                            setTruckFilter(v);
                            setPage(1);
                        }}
                        clearFilters={clearFilters}
                    />
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-lg border">
                <Table
                    style={{ minWidth: 'max-content', tableLayout: 'fixed' }}
                >
                    <TableHeader>
                        <TableRow>
                            {visibleHeaders.map((header) => (
                                <ColHead
                                    key={header.id}
                                    id={header.id}
                                    size={header.column.getSize()}
                                    isSorted={header.column.getIsSorted()}
                                    canSort={header.column.getCanSort()}
                                    onSort={() => header.column.toggleSorting()}
                                    onResize={handleResize}
                                >
                                    {flexRender(
                                        header.column.columnDef.header,
                                        header.getContext(),
                                    )}
                                </ColHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {table.getRowModel().rows.map((row) => (
                            <TableRow
                                key={row.id}
                                className={
                                    row.original.missing_config
                                        ? 'bg-amber-50 dark:bg-amber-950/20'
                                        : ''
                                }
                            >
                                {row.getVisibleCells().map((cell) => (
                                    <TableCell
                                        key={cell.id}
                                        style={{
                                            width: cell.column.getSize(),
                                            minWidth: cell.column.getSize(),
                                        }}
                                        className="overflow-hidden px-2 py-2 text-sm text-ellipsis whitespace-nowrap tabular-nums"
                                    >
                                        {renderCell(
                                            row.original,
                                            cell.column.id,
                                        )}
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))}
                        {totalRow && (
                            <TableRow className="bg-muted font-bold">
                                {visibleHeaders.map((header) => (
                                    <TableCell
                                        key={header.id}
                                        style={{
                                            width: header.column.getSize(),
                                            minWidth: header.column.getSize(),
                                        }}
                                        className="overflow-hidden px-2 py-2 text-sm text-ellipsis whitespace-nowrap tabular-nums"
                                    >
                                        {renderTotalCell(header.id)}
                                    </TableCell>
                                ))}
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Rows per page</span>
                    <Select
                        value={String(pageSize)}
                        onValueChange={(v) => {
                            setPageSize(Number(v));
                            setPage(1);
                        }}
                    >
                        <SelectTrigger className="h-7 w-16">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent side="top">
                            {PAGE_SIZE_OPTIONS.map((n) => (
                                <SelectItem key={n} value={String(n)}>
                                    {n}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                {pageCount > 1 && (
                    <Pagination className="mx-0 w-auto flex-1 justify-start">
                        <PaginationContent className="flex-wrap">
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
                                <span className="px-3 py-2 text-sm whitespace-nowrap text-muted-foreground">
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

// ---------------------------------------------------------------------------
// Settings popover — Notion-style navigable menu
// ---------------------------------------------------------------------------

type ViewKey = 'main' | 'visibility' | 'filter';

type Column = ReturnType<
    ReturnType<typeof useReactTable<Row>>['getAllLeafColumns']
>[number];

interface SettingsPopoverProps {
    activeFilterCount: number;
    canDownload: boolean;
    onExport: () => void;
    onDownloadImage: () => void;
    columns: Column[];
    columnVisibility: Record<string, boolean>;
    setColumnVisibility: React.Dispatch<
        React.SetStateAction<Record<string, boolean>>
    >;
    driverFilter: string;
    setDriverFilter: (v: string) => void;
    dispatchers: string[];
    dispatcherFilter: Option[];
    setDispatcherFilter: (v: Option[]) => void;
    contractTypes: string[];
    typeFilter: Option[];
    setTypeFilter: (v: Option[]) => void;
    trucks: string[];
    truckFilter: Option[];
    setTruckFilter: (v: Option[]) => void;
    clearFilters: () => void;
}

function SettingsPopover({
    activeFilterCount,
    canDownload,
    onExport,
    onDownloadImage,
    columns,
    columnVisibility,
    setColumnVisibility,
    driverFilter,
    setDriverFilter,
    dispatchers,
    dispatcherFilter,
    setDispatcherFilter,
    contractTypes,
    typeFilter,
    setTypeFilter,
    trucks,
    truckFilter,
    setTruckFilter,
    clearFilters,
}: SettingsPopoverProps) {
    const [view, setView] = useState<ViewKey>('main');
    const visibleCount = columns.filter(
        (c) => columnVisibility[c.id] !== false,
    ).length;
    const totalCount = columns.length;

    return (
        <Popover onOpenChange={(open) => !open && setView('main')}>
            <PopoverTrigger asChild>
                <button
                    className={cn(
                        'inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors hover:bg-accent',
                        activeFilterCount > 0
                            ? 'border-primary/40 bg-primary/5 text-primary'
                            : 'text-muted-foreground',
                    )}
                >
                    <Settings2Icon className="h-3.5 w-3.5" />
                    Settings
                    {activeFilterCount > 0 && (
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                            {activeFilterCount}
                        </span>
                    )}
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 overflow-visible p-0">
                {view === 'main' && (
                    <div className="flex flex-col py-1">
                        <p className="px-3 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                            View settings
                        </p>
                        <SettingsRow
                            icon={<EyeIcon className="h-4 w-4" />}
                            label="Property visibility"
                            value={`${visibleCount}/${totalCount}`}
                            onClick={() => setView('visibility')}
                        />
                        <SettingsRow
                            icon={<FilterIcon className="h-4 w-4" />}
                            label="Filter"
                            value={
                                activeFilterCount > 0
                                    ? `${activeFilterCount} active`
                                    : undefined
                            }
                            onClick={() => setView('filter')}
                        />
                        {canDownload && (
                            <>
                                <div className="my-1 border-t" />
                                <SettingsRow
                                    icon={<DownloadIcon className="h-4 w-4" />}
                                    label="Export to XLSX"
                                    onClick={onExport}
                                    showChevron={false}
                                />
                                <SettingsRow
                                    icon={<ImageIcon className="h-4 w-4" />}
                                    label="Download as image"
                                    onClick={onDownloadImage}
                                    showChevron={false}
                                />
                            </>
                        )}
                    </div>
                )}

                {view === 'visibility' && (
                    <VisibilityPanel
                        columns={columns}
                        columnVisibility={columnVisibility}
                        setColumnVisibility={setColumnVisibility}
                        onBack={() => setView('main')}
                    />
                )}

                {view === 'filter' && (
                    <FilterPanel
                        onBack={() => setView('main')}
                        activeFilterCount={activeFilterCount}
                        driverFilter={driverFilter}
                        setDriverFilter={setDriverFilter}
                        dispatchers={dispatchers}
                        dispatcherFilter={dispatcherFilter}
                        setDispatcherFilter={setDispatcherFilter}
                        contractTypes={contractTypes}
                        typeFilter={typeFilter}
                        setTypeFilter={setTypeFilter}
                        trucks={trucks}
                        truckFilter={truckFilter}
                        setTruckFilter={setTruckFilter}
                        clearFilters={clearFilters}
                    />
                )}
            </PopoverContent>
        </Popover>
    );
}

function SettingsRow({
    icon,
    label,
    value,
    onClick,
    showChevron = true,
}: {
    icon: React.ReactNode;
    label: string;
    value?: string;
    onClick: () => void;
    showChevron?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-accent"
        >
            <span className="text-muted-foreground">{icon}</span>
            <span className="flex-1 text-left">{label}</span>
            {value && (
                <span className="text-xs text-muted-foreground">{value}</span>
            )}
            {showChevron && (
                <ChevronRightIcon className="h-3.5 w-3.5 text-muted-foreground" />
            )}
        </button>
    );
}

function PanelHeader({
    title,
    onBack,
    action,
}: {
    title: string;
    onBack: () => void;
    action?: React.ReactNode;
}) {
    return (
        <div className="flex items-center gap-2 border-b px-2 py-2">
            <button
                onClick={onBack}
                className="flex h-6 w-6 items-center justify-center rounded hover:bg-accent"
                aria-label="Back"
            >
                <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <p className="flex-1 text-sm font-semibold">{title}</p>
            {action}
        </div>
    );
}

function VisibilityPanel({
    columns,
    columnVisibility,
    setColumnVisibility,
    onBack,
}: {
    columns: Column[];
    columnVisibility: Record<string, boolean>;
    setColumnVisibility: React.Dispatch<
        React.SetStateAction<Record<string, boolean>>
    >;
    onBack: () => void;
}) {
    const [search, setSearch] = useState('');

    const getLabel = (col: Column) =>
        typeof col.columnDef.header === 'string'
            ? col.columnDef.header
            : col.id.startsWith('expense_')
              ? col.id.slice('expense_'.length)
              : col.id;
    const isVisible = (colId: string) => columnVisibility[colId] !== false;

    const toggleColumn = (colId: string) => {
        setColumnVisibility((prev) => ({
            ...prev,
            [colId]: prev[colId] === false,
        }));
    };

    const hideAll = () => {
        setColumnVisibility(
            Object.fromEntries(columns.map((c) => [c.id, false])),
        );
    };

    const showAll = () => {
        setColumnVisibility({});
    };

    const filtered = useMemo(() => {
        if (!search.trim()) {
            return columns;
        }

        const q = search.toLowerCase();

        return columns.filter((c) => getLabel(c).toLowerCase().includes(q));
    }, [columns, search]);

    const shown = filtered.filter((c) => isVisible(c.id));
    const hidden = filtered.filter((c) => !isVisible(c.id));

    return (
        <div className="flex flex-col">
            <PanelHeader title="Property visibility" onBack={onBack} />
            <div className="border-b p-2">
                <div className="relative flex items-center">
                    <SearchIcon className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                        autoFocus
                        placeholder="Search for a property…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="h-8 w-full rounded-md border bg-transparent pr-2 pl-7 text-sm focus:ring-1 focus:ring-ring focus:outline-none"
                    />
                </div>
            </div>
            <div className="max-h-80 overflow-y-auto">
                {filtered.length === 0 && (
                    <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                        No properties
                    </p>
                )}

                {shown.length > 0 && (
                    <VisibilitySection
                        title="Shown in table"
                        action={
                            <button
                                onClick={hideAll}
                                className="text-xs font-medium text-primary hover:underline"
                            >
                                Hide all
                            </button>
                        }
                    >
                        {shown.map((col) => (
                            <PropertyRow
                                key={col.id}
                                label={getLabel(col)}
                                visible
                                onToggle={() => toggleColumn(col.id)}
                            />
                        ))}
                    </VisibilitySection>
                )}

                {hidden.length > 0 && (
                    <VisibilitySection
                        title="Hidden in table"
                        action={
                            <button
                                onClick={showAll}
                                className="text-xs font-medium text-primary hover:underline"
                            >
                                Show all
                            </button>
                        }
                    >
                        {hidden.map((col) => (
                            <PropertyRow
                                key={col.id}
                                label={getLabel(col)}
                                visible={false}
                                onToggle={() => toggleColumn(col.id)}
                            />
                        ))}
                    </VisibilitySection>
                )}
            </div>
        </div>
    );
}

function VisibilitySection({
    title,
    action,
    children,
}: {
    title: string;
    action?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div className="py-1">
            <div className="flex items-center justify-between px-3 py-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                    {title}
                </p>
                {action}
            </div>
            {children}
        </div>
    );
}

function PropertyRow({
    label,
    visible,
    onToggle,
}: {
    label: string;
    visible: boolean;
    onToggle: () => void;
}) {
    return (
        <button
            onClick={onToggle}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors hover:bg-accent"
        >
            <span
                className={cn(
                    'flex-1 truncate text-left',
                    !visible && 'text-muted-foreground',
                )}
            >
                {label}
            </span>
            {visible ? (
                <EyeIcon className="h-4 w-4 text-foreground" />
            ) : (
                <EyeOffIcon className="h-4 w-4 text-muted-foreground/60" />
            )}
        </button>
    );
}

function FilterPanel({
    onBack,
    activeFilterCount,
    driverFilter,
    setDriverFilter,
    dispatchers,
    dispatcherFilter,
    setDispatcherFilter,
    contractTypes,
    typeFilter,
    setTypeFilter,
    trucks,
    truckFilter,
    setTruckFilter,
    clearFilters,
}: Omit<
    SettingsPopoverProps,
    | 'columns'
    | 'onExport'
    | 'onDownloadImage'
    | 'canDownload'
    | 'columnVisibility'
    | 'setColumnVisibility'
> & { onBack: () => void }) {
    return (
        <div className="flex flex-col">
            <PanelHeader
                title="Filter"
                onBack={onBack}
                action={
                    activeFilterCount > 0 ? (
                        <button
                            onClick={clearFilters}
                            className="text-xs font-medium text-primary hover:underline"
                        >
                            Clear all
                        </button>
                    ) : undefined
                }
            />
            <div className="flex flex-col gap-3 p-3">
                <div className="relative flex items-center">
                    <SearchIcon className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                        placeholder="Search driver…"
                        value={driverFilter}
                        onChange={(e) => setDriverFilter(e.target.value)}
                        className="h-8 w-full rounded-md border bg-transparent pr-7 pl-7 text-sm focus:ring-1 focus:ring-ring focus:outline-none"
                    />
                    {driverFilter && (
                        <button
                            onClick={() => setDriverFilter('')}
                            className="absolute right-2"
                        >
                            <XIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                    )}
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground">
                        Dispatcher
                    </label>
                    <MultipleSelector
                        value={dispatcherFilter}
                        onChange={setDispatcherFilter}
                        defaultOptions={dispatchers.map((d) => ({
                            label: d,
                            value: d,
                        }))}
                        placeholder="All dispatchers"
                        hideClearAllButton
                        emptyIndicator={
                            <p className="text-center text-xs text-muted-foreground">
                                No results
                            </p>
                        }
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground">
                        Type
                    </label>
                    <MultipleSelector
                        value={typeFilter}
                        onChange={setTypeFilter}
                        defaultOptions={contractTypes.map((t) => ({
                            label: t,
                            value: t,
                        }))}
                        placeholder="All types"
                        hideClearAllButton
                        emptyIndicator={
                            <p className="text-center text-xs text-muted-foreground">
                                No results
                            </p>
                        }
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground">
                        Truck
                    </label>
                    <MultipleSelector
                        value={truckFilter}
                        onChange={setTruckFilter}
                        defaultOptions={trucks.map((t) => ({
                            label: t,
                            value: t,
                        }))}
                        placeholder="All trucks"
                        hideClearAllButton
                        emptyIndicator={
                            <p className="text-center text-xs text-muted-foreground">
                                No results
                            </p>
                        }
                    />
                </div>
            </div>
        </div>
    );
}

