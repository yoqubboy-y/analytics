import { Head, router, usePage } from '@inertiajs/react';
import { ReceiptText } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import {
    destroyDriverConfigRate,
    destroyExpense,
    destroyExpenseRate,
    index as configurationIndex,
    storeDriverConfig,
    storeDriverConfigRate,
    storeExpense,
    storeExpenseRate,
    updateDriverConfig,
    updateDriverConfigRate,
    updateExpense,
    updateExpenseRate,
} from '@/actions/App/Http/Controllers/Analytics/ConfigurationController';
import { RateHistoryDialog } from '@/components/analytics/rate-history-dialog';
import type { RateRow } from '@/components/analytics/rate-history-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationNext,
    PaginationPrevious,
} from '@/components/ui/pagination';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { WeekPicker, isoMonday } from '@/components/week-picker';
import { ImportsTab } from './imports-tab';

type ContractType = { value: string; label: string };
type CalculationType = { value: string; label: string };

type DriverConfigRate = {
    id: number;
    tariff_rate: number;
    effective_from: string;
    effective_to: string | null;
};

type DriverConfig = {
    id: number;
    external_driver_id: number | null;
    external_driver_key: string | null;
    driver_name: string;
    dispatcher: string | null;
    contract_type: string;
    current_rate: number | null;
    rates: DriverConfigRate[];
};

type ImportedDriver = {
    external_driver_key: string;
    driver_name: string;
    truck_number: string | null;
};

type ExpenseRate = {
    id: number;
    rate: number;
    effective_from: string;
    effective_to: string | null;
};

type TeamExpense = {
    id: number;
    name: string;
    description: string | null;
    calculation_type: string;
    current_rate: number | null;
    rates: ExpenseRate[];
    applies_to: string[] | null;
    skip_when_no_gross: boolean;
    sort_order: number;
};

type Props = {
    driverConfigs: DriverConfig[];
    expenses: TeamExpense[];
    contractTypes: ContractType[];
    calculationTypes: CalculationType[];
    importedDrivers: ImportedDriver[];
    dataSource: 'analytics_db' | 'xlsx';
    canImport: boolean;
    canChangeDataSource: boolean;
    importSummary: {
        total_rows: number;
        min_date: string | null;
        max_date: string | null;
        last_filename: string | null;
        last_format: string | null;
        last_imported_at: string | null;
    };
};

// Rate mutations redirect back; keep the dialog open and the scroll position.
const RATE_VISIT_OPTIONS = {
    preserveScroll: true,
    preserveState: true,
} as const;

const fmtTariff = (rate: number, contractType: string) =>
    contractType === 'company_cpm'
        ? rate.toString()
        : `${(rate * 100).toFixed(2)}%`;

const fmtExpenseRate = (rate: number, calculationType: string) =>
    calculationType === 'percentage_of_gross'
        ? `${(rate * 100).toFixed(2)}%`
        : rate.toString();

function SkipNoGrossCheckbox({
    checked,
    onChange,
}: {
    checked: boolean;
    onChange: (v: boolean) => void;
}) {
    const id = useId();

    return (
        <div className="relative flex w-full items-start gap-2 rounded-md border border-input p-3 shadow-xs outline-none has-data-[state=checked]:border-primary/50">
            <div className="grid grow gap-1">
                <Label htmlFor={id} className="cursor-pointer">
                    Skip when driver has $0 gross
                </Label>
                <p
                    className="text-xs text-muted-foreground"
                    id={`${id}-description`}
                >
                    Don't charge this expense to drivers who didn't run any
                    loads that week.
                </p>
            </div>
            <Checkbox
                id={id}
                aria-describedby={`${id}-description`}
                className="order-1 after:absolute after:inset-0"
                checked={checked}
                onCheckedChange={(v) => onChange(v === true)}
            />
        </div>
    );
}

const emptyExpense = {
    name: '',
    description: '',
    calculation_type: 'flat',
    rate: '',
    effective_from: isoMonday(),
    applies_to: [] as string[],
    skip_when_no_gross: false,
    sort_order: 0,
};

type RateDialogTarget = { kind: 'driver' | 'expense'; id: number };

export default function Configuration({
    driverConfigs,
    expenses,
    contractTypes,
    calculationTypes,
    importedDrivers,
    dataSource,
    canImport,
    canChangeDataSource,
    importSummary,
}: Props) {
    const page = usePage();
    const slug = page.props.currentTeam?.slug ?? '';

    // --- Driver Config Editing ---
    const [driverPage, setDriverPage] = useState(1);
    const [driverPageSize, setDriverPageSize] = useState(15);
    const driverPageCount = Math.ceil(driverConfigs.length / driverPageSize);
    const pagedDriverConfigs = driverConfigs.slice(
        (driverPage - 1) * driverPageSize,
        driverPage * driverPageSize,
    );

    const isXlsx = dataSource === 'xlsx';

    const emptyDriverConfig = {
        external_driver_id: '',
        external_driver_key: '',
        dispatcher: '',
        contract_type: contractTypes[0]?.value ?? '',
        tariff_rate: '',
        effective_from: isoMonday(),
    };
    const [newDriverConfig, setNewDriverConfig] = useState({
        ...emptyDriverConfig,
    });
    const [addDriverOpen, setAddDriverOpen] = useState(false);

    // Imported drivers that don't yet have a config — what the XLSX driver
    // picker offers. Recomputes when imports or configs change.
    const unconfiguredImportedDrivers = useMemo(() => {
        const taken = new Set(
            driverConfigs
                .map((dc) => dc.external_driver_key)
                .filter((k): k is string => !!k),
        );
        return importedDrivers.filter((d) => !taken.has(d.external_driver_key));
    }, [importedDrivers, driverConfigs]);

    function submitNewDriverConfig(e: React.FormEvent) {
        e.preventDefault();
        const payload: Record<string, unknown> = {
            contract_type: newDriverConfig.contract_type,
            tariff_rate: parseFloat(newDriverConfig.tariff_rate as string),
            effective_from: newDriverConfig.effective_from,
            dispatcher: newDriverConfig.dispatcher.trim() || null,
        };

        if (isXlsx) {
            payload.external_driver_key = newDriverConfig.external_driver_key;
        } else {
            payload.external_driver_id = parseInt(
                newDriverConfig.external_driver_id as string,
            );
        }

        router[storeDriverConfig(slug).method](
            storeDriverConfig.url(slug),
            // Inertia accepts JSON-serialisable payloads at runtime; its TS
            // typing is conservative for mixed-shape `Record<string, unknown>`.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            payload as any,
            {
                onSuccess: () => {
                    setNewDriverConfig({ ...emptyDriverConfig });
                    setAddDriverOpen(false);
                },
            },
        );
    }

    const [editingDriver, setEditingDriver] = useState<{
        id: number;
        contract_type: string;
        dispatcher: string;
    } | null>(null);

    function startEditDriver(dc: DriverConfig) {
        setEditingDriver({
            id: dc.id,
            contract_type: dc.contract_type,
            dispatcher: dc.dispatcher ?? '',
        });
    }

    function saveDriver() {
        if (!editingDriver) {
            return;
        }

        router[updateDriverConfig([slug, editingDriver.id]).method](
            updateDriverConfig.url([slug, editingDriver.id]),
            {
                contract_type: editingDriver.contract_type,
                dispatcher: editingDriver.dispatcher.trim() || null,
            },
            { onSuccess: () => setEditingDriver(null) },
        );
    }

    // --- Team Expense Editing ---
    const [newExpense, setNewExpense] = useState({ ...emptyExpense });
    const [addExpenseOpen, setAddExpenseOpen] = useState(false);
    const [editingExpense, setEditingExpense] = useState<TeamExpense | null>(
        null,
    );

    function submitNewExpense(e: React.FormEvent) {
        e.preventDefault();
        router[storeExpense(slug).method](
            storeExpense.url(slug),
            {
                ...newExpense,
                rate: parseFloat(newExpense.rate as string),
                applies_to:
                    newExpense.applies_to.length > 0
                        ? newExpense.applies_to
                        : null,
                skip_when_no_gross: newExpense.skip_when_no_gross,
            },
            {
                onSuccess: () => {
                    setNewExpense({
                        ...emptyExpense,
                        effective_from: isoMonday(),
                    });
                    setAddExpenseOpen(false);
                },
            },
        );
    }

    function saveExpense() {
        if (!editingExpense) {
            return;
        }

        router[updateExpense([slug, editingExpense.id]).method](
            updateExpense.url([slug, editingExpense.id]),
            {
                name: editingExpense.name,
                description: editingExpense.description,
                calculation_type: editingExpense.calculation_type,
                applies_to:
                    editingExpense.applies_to &&
                    editingExpense.applies_to.length > 0
                        ? editingExpense.applies_to
                        : null,
                skip_when_no_gross: editingExpense.skip_when_no_gross,
                sort_order: editingExpense.sort_order,
            },
            { onSuccess: () => setEditingExpense(null) },
        );
    }

    function deleteExpense(id: number) {
        if (!confirm('Delete this expense?')) {
            return;
        }

        router[destroyExpense([slug, id]).method](
            destroyExpense.url([slug, id]),
        );
    }

    // --- Rate history dialog ---
    const [rateTarget, setRateTarget] = useState<RateDialogTarget | null>(null);

    const activeDriver =
        rateTarget?.kind === 'driver'
            ? (driverConfigs.find((dc) => dc.id === rateTarget.id) ?? null)
            : null;
    const activeExpense =
        rateTarget?.kind === 'expense'
            ? (expenses.find((e) => e.id === rateTarget.id) ?? null)
            : null;

    function addDriverRate(
        driverId: number,
        rate: number,
        effectiveFrom: string,
        effectiveTo: string | null,
    ) {
        router[storeDriverConfigRate([slug, driverId]).method](
            storeDriverConfigRate.url([slug, driverId]),
            {
                tariff_rate: rate,
                effective_from: effectiveFrom,
                effective_to: effectiveTo,
            },
            RATE_VISIT_OPTIONS,
        );
    }

    function updateDriverRate(
        driverId: number,
        rateId: number,
        rate: number,
        effectiveFrom: string,
        effectiveTo: string | null,
    ) {
        router[updateDriverConfigRate([slug, driverId, rateId]).method](
            updateDriverConfigRate.url([slug, driverId, rateId]),
            {
                tariff_rate: rate,
                effective_from: effectiveFrom,
                effective_to: effectiveTo,
            },
            RATE_VISIT_OPTIONS,
        );
    }

    function deleteDriverRate(driverId: number, rateId: number) {
        router[destroyDriverConfigRate([slug, driverId, rateId]).method](
            destroyDriverConfigRate.url([slug, driverId, rateId]),
            RATE_VISIT_OPTIONS,
        );
    }

    function addExpenseRate(
        expenseId: number,
        rate: number,
        effectiveFrom: string,
        effectiveTo: string | null,
    ) {
        router[storeExpenseRate([slug, expenseId]).method](
            storeExpenseRate.url([slug, expenseId]),
            { rate, effective_from: effectiveFrom, effective_to: effectiveTo },
            RATE_VISIT_OPTIONS,
        );
    }

    function updateExpenseRateValue(
        expenseId: number,
        rateId: number,
        rate: number,
        effectiveFrom: string,
        effectiveTo: string | null,
    ) {
        router[updateExpenseRate([slug, expenseId, rateId]).method](
            updateExpenseRate.url([slug, expenseId, rateId]),
            { rate, effective_from: effectiveFrom, effective_to: effectiveTo },
            RATE_VISIT_OPTIONS,
        );
    }

    function deleteExpenseRate(expenseId: number, rateId: number) {
        router[destroyExpenseRate([slug, expenseId, rateId]).method](
            destroyExpenseRate.url([slug, expenseId, rateId]),
            RATE_VISIT_OPTIONS,
        );
    }

    return (
        <>
            <Head title="Configurations" />
            <div className="flex flex-col gap-4 p-4">
                <Tabs defaultValue="drivers">
                    <TabsList className="gap-1 bg-transparent">
                        <TabsTrigger
                            className="rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none"
                            value="drivers"
                        >
                            Driver Contracts
                        </TabsTrigger>
                        <TabsTrigger
                            className="rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none"
                            value="expenses"
                        >
                            Team Expenses
                        </TabsTrigger>
                        <TabsTrigger
                            className="rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none"
                            value="imports"
                        >
                            Imports
                        </TabsTrigger>
                    </TabsList>

                    {/* Driver Contracts Tab */}
                    <TabsContent value="drivers" className="mt-4">
                        <div className="mb-4 flex justify-end">
                            <Dialog
                                open={addDriverOpen}
                                onOpenChange={setAddDriverOpen}
                            >
                                <DialogTrigger asChild>
                                    <Button size="sm">Add Driver Config</Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>
                                            Add Driver Config
                                        </DialogTitle>
                                    </DialogHeader>
                                    <form
                                        id="add-driver-config-form"
                                        onSubmit={submitNewDriverConfig}
                                    >
                                        <div className="flex flex-col gap-4">
                                            {isXlsx ? (
                                                <div className="flex flex-col gap-1">
                                                    <Label htmlFor="dc-driver-key">
                                                        Driver (from imports)
                                                    </Label>
                                                    <Select
                                                        value={
                                                            newDriverConfig.external_driver_key
                                                        }
                                                        onValueChange={(v) =>
                                                            setNewDriverConfig({
                                                                ...newDriverConfig,
                                                                external_driver_key: v,
                                                            })
                                                        }
                                                    >
                                                        <SelectTrigger id="dc-driver-key">
                                                            <SelectValue placeholder="Pick a driver…" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {unconfiguredImportedDrivers.length === 0 && (
                                                                <div className="px-3 py-2 text-xs text-muted-foreground">
                                                                    {importedDrivers.length === 0
                                                                        ? 'No imported drivers yet — upload a workbook first.'
                                                                        : 'Every imported driver already has a config.'}
                                                                </div>
                                                            )}
                                                            {unconfiguredImportedDrivers.map(
                                                                (d) => (
                                                                    <SelectItem
                                                                        key={d.external_driver_key}
                                                                        value={d.external_driver_key}
                                                                    >
                                                                        {d.driver_name}
                                                                        {d.truck_number ? ` · ${d.truck_number}` : ''}
                                                                    </SelectItem>
                                                                ),
                                                            )}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col gap-1">
                                                    <Label htmlFor="dc-driver-id">
                                                        Driver ID
                                                    </Label>
                                                    <Input
                                                        id="dc-driver-id"
                                                        type="number"
                                                        min="1"
                                                        required
                                                        value={
                                                            newDriverConfig.external_driver_id
                                                        }
                                                        onChange={(e) =>
                                                            setNewDriverConfig({
                                                                ...newDriverConfig,
                                                                external_driver_id:
                                                                    e.target.value,
                                                            })
                                                        }
                                                        placeholder="e.g. 42"
                                                    />
                                                </div>
                                            )}
                                            <div className="flex flex-col gap-1">
                                                <Label htmlFor="dc-dispatcher">
                                                    Dispatcher{' '}
                                                    <span className="text-xs font-normal text-muted-foreground">
                                                        (optional)
                                                    </span>
                                                </Label>
                                                <Input
                                                    id="dc-dispatcher"
                                                    value={newDriverConfig.dispatcher}
                                                    onChange={(e) =>
                                                        setNewDriverConfig({
                                                            ...newDriverConfig,
                                                            dispatcher: e.target.value,
                                                        })
                                                    }
                                                    placeholder="e.g. Aidan Scott"
                                                />
                                            </div>
                                            <div className="flex gap-4">
                                                <div className="flex flex-1 flex-col gap-1">
                                                    <Label htmlFor="dc-contract-type">
                                                        Contract Type
                                                    </Label>
                                                    <Select
                                                        value={
                                                            newDriverConfig.contract_type
                                                        }
                                                        onValueChange={(v) =>
                                                            setNewDriverConfig({
                                                                ...newDriverConfig,
                                                                contract_type:
                                                                    v,
                                                            })
                                                        }
                                                    >
                                                        <SelectTrigger id="dc-contract-type">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {contractTypes.map(
                                                                (ct) => (
                                                                    <SelectItem
                                                                        key={
                                                                            ct.value
                                                                        }
                                                                        value={
                                                                            ct.value
                                                                        }
                                                                    >
                                                                        {
                                                                            ct.label
                                                                        }
                                                                    </SelectItem>
                                                                ),
                                                            )}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="flex w-32 flex-col gap-1">
                                                    <Label htmlFor="dc-rate">
                                                        Rate
                                                    </Label>
                                                    <Input
                                                        id="dc-rate"
                                                        type="number"
                                                        step={
                                                            newDriverConfig.contract_type ===
                                                            'company_cpm'
                                                                ? '0.01'
                                                                : '0.001'
                                                        }
                                                        min="0"
                                                        required
                                                        value={
                                                            newDriverConfig.tariff_rate
                                                        }
                                                        onChange={(e) =>
                                                            setNewDriverConfig({
                                                                ...newDriverConfig,
                                                                tariff_rate:
                                                                    e.target
                                                                        .value,
                                                            })
                                                        }
                                                        placeholder={
                                                            newDriverConfig.contract_type ===
                                                            'company_cpm'
                                                                ? '0.65'
                                                                : '0.30'
                                                        }
                                                    />
                                                    {newDriverConfig.contract_type !==
                                                        'company_cpm' && (
                                                        <span className="text-xs text-muted-foreground">
                                                            e.g.{' '}
                                                            <strong>
                                                                0.30
                                                            </strong>{' '}
                                                            = 30%
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <Label>Effective from</Label>
                                                <WeekPicker
                                                    value={
                                                        newDriverConfig.effective_from
                                                    }
                                                    onChange={(v) =>
                                                        setNewDriverConfig({
                                                            ...newDriverConfig,
                                                            effective_from: v,
                                                        })
                                                    }
                                                />
                                            </div>
                                        </div>
                                    </form>
                                    <DialogFooter>
                                        <Button
                                            type="submit"
                                            form="add-driver-config-form"
                                        >
                                            Add Config
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>

                        <div className="overflow-x-auto rounded-lg border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Driver</TableHead>
                                        <TableHead>Dispatcher</TableHead>
                                        <TableHead>Contract Type</TableHead>
                                        <TableHead>Current Rate</TableHead>
                                        <TableHead></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {pagedDriverConfigs.map((dc) => {
                                        const isEditing =
                                            editingDriver?.id === dc.id;

                                        return (
                                            <TableRow key={dc.id}>
                                                <TableCell className="font-medium">
                                                    {dc.driver_name}
                                                </TableCell>
                                                <TableCell>
                                                    {isEditing ? (
                                                        <Input
                                                            value={editingDriver.dispatcher}
                                                            onChange={(e) =>
                                                                setEditingDriver({
                                                                    ...editingDriver,
                                                                    dispatcher: e.target.value,
                                                                })
                                                            }
                                                            placeholder="Aidan Scott"
                                                            className="w-40"
                                                        />
                                                    ) : (
                                                        <span className={dc.dispatcher ? '' : 'text-muted-foreground'}>
                                                            {dc.dispatcher ?? '—'}
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    {isEditing ? (
                                                        <Select
                                                            value={
                                                                editingDriver.contract_type
                                                            }
                                                            onValueChange={(
                                                                v,
                                                            ) =>
                                                                setEditingDriver(
                                                                    {
                                                                        ...editingDriver,
                                                                        contract_type:
                                                                            v,
                                                                    },
                                                                )
                                                            }
                                                        >
                                                            <SelectTrigger className="w-40">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {contractTypes.map(
                                                                    (ct) => (
                                                                        <SelectItem
                                                                            key={
                                                                                ct.value
                                                                            }
                                                                            value={
                                                                                ct.value
                                                                            }
                                                                        >
                                                                            {
                                                                                ct.label
                                                                            }
                                                                        </SelectItem>
                                                                    ),
                                                                )}
                                                            </SelectContent>
                                                        </Select>
                                                    ) : (
                                                        (contractTypes.find(
                                                            (ct) =>
                                                                ct.value ===
                                                                dc.contract_type,
                                                        )?.label ??
                                                        dc.contract_type)
                                                    )}
                                                </TableCell>
                                                <TableCell className="tabular-nums">
                                                    {dc.current_rate != null
                                                        ? fmtTariff(
                                                              dc.current_rate,
                                                              dc.contract_type,
                                                          )
                                                        : '—'}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {isEditing ? (
                                                        <div className="flex justify-end gap-2">
                                                            <Button
                                                                size="sm"
                                                                onClick={
                                                                    saveDriver
                                                                }
                                                            >
                                                                Save
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() =>
                                                                    setEditingDriver(
                                                                        null,
                                                                    )
                                                                }
                                                            >
                                                                Cancel
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex justify-end gap-2">
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() =>
                                                                    setRateTarget(
                                                                        {
                                                                            kind: 'driver',
                                                                            id: dc.id,
                                                                        },
                                                                    )
                                                                }
                                                            >
                                                                Rates
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() =>
                                                                    startEditDriver(
                                                                        dc,
                                                                    )
                                                                }
                                                            >
                                                                Edit
                                                            </Button>
                                                        </div>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <span>Rows per page</span>
                                <Select
                                    value={String(driverPageSize)}
                                    onValueChange={(v) => {
                                        setDriverPageSize(Number(v));
                                        setDriverPage(1);
                                    }}
                                >
                                    <SelectTrigger className="h-7 w-16">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {[10, 15, 25, 50, 100].map((n) => (
                                            <SelectItem
                                                key={n}
                                                value={String(n)}
                                            >
                                                {n}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {driverPageCount > 1 && (
                                <Pagination className="flex-1 justify-start">
                                    <PaginationContent>
                                        <PaginationItem>
                                            <PaginationPrevious
                                                onClick={() =>
                                                    setDriverPage((p) =>
                                                        Math.max(1, p - 1),
                                                    )
                                                }
                                                className={
                                                    driverPage <= 1
                                                        ? 'pointer-events-none opacity-50'
                                                        : 'cursor-pointer'
                                                }
                                            />
                                        </PaginationItem>
                                        <PaginationItem>
                                            <span className="px-3 py-2 text-sm text-muted-foreground">
                                                {(driverPage - 1) *
                                                    driverPageSize +
                                                    1}
                                                –
                                                {Math.min(
                                                    driverPage * driverPageSize,
                                                    driverConfigs.length,
                                                )}{' '}
                                                of {driverConfigs.length}{' '}
                                                drivers
                                            </span>
                                        </PaginationItem>
                                        <PaginationItem>
                                            <PaginationNext
                                                onClick={() =>
                                                    setDriverPage((p) =>
                                                        Math.min(
                                                            driverPageCount,
                                                            p + 1,
                                                        ),
                                                    )
                                                }
                                                className={
                                                    driverPage >=
                                                    driverPageCount
                                                        ? 'pointer-events-none opacity-50'
                                                        : 'cursor-pointer'
                                                }
                                            />
                                        </PaginationItem>
                                    </PaginationContent>
                                </Pagination>
                            )}
                        </div>
                    </TabsContent>

                    {/* Team Expenses Tab */}
                    <TabsContent
                        value="expenses"
                        className="mt-4 flex flex-col gap-4"
                    >
                        <div className="flex justify-end">
                            <Dialog
                                open={addExpenseOpen}
                                onOpenChange={setAddExpenseOpen}
                            >
                                <DialogTrigger asChild>
                                    <Button size="sm">Add Expense</Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Add Expense</DialogTitle>
                                    </DialogHeader>
                                    <form
                                        id="add-expense-form"
                                        onSubmit={submitNewExpense}
                                    >
                                        <div className="grid gap-4 sm:grid-cols-2">
                                            <div className="flex flex-col gap-1">
                                                <Label htmlFor="exp-name">
                                                    Name
                                                </Label>
                                                <Input
                                                    id="exp-name"
                                                    required
                                                    value={newExpense.name}
                                                    onChange={(e) =>
                                                        setNewExpense({
                                                            ...newExpense,
                                                            name: e.target
                                                                .value,
                                                        })
                                                    }
                                                    placeholder="e.g. Fuel Surcharge"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <Label htmlFor="exp-type">
                                                    Calculation Type
                                                </Label>
                                                <Select
                                                    value={
                                                        newExpense.calculation_type
                                                    }
                                                    onValueChange={(v) =>
                                                        setNewExpense({
                                                            ...newExpense,
                                                            calculation_type: v,
                                                        })
                                                    }
                                                >
                                                    <SelectTrigger id="exp-type">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {calculationTypes.map(
                                                            (ct) => (
                                                                <SelectItem
                                                                    key={
                                                                        ct.value
                                                                    }
                                                                    value={
                                                                        ct.value
                                                                    }
                                                                >
                                                                    {ct.label}
                                                                </SelectItem>
                                                            ),
                                                        )}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <Label htmlFor="exp-rate">
                                                    Rate
                                                </Label>
                                                <Input
                                                    id="exp-rate"
                                                    type="number"
                                                    step={
                                                        newExpense.calculation_type ===
                                                        'percentage_of_gross'
                                                            ? '0.001'
                                                            : '0.01'
                                                    }
                                                    required
                                                    value={newExpense.rate}
                                                    onChange={(e) =>
                                                        setNewExpense({
                                                            ...newExpense,
                                                            rate: e.target
                                                                .value,
                                                        })
                                                    }
                                                    placeholder={
                                                        newExpense.calculation_type ===
                                                        'percentage_of_gross'
                                                            ? '0.026'
                                                            : '0.00'
                                                    }
                                                />
                                                {newExpense.calculation_type ===
                                                    'percentage_of_gross' && (
                                                    <span className="text-xs text-muted-foreground">
                                                        Enter as decimal — e.g.{' '}
                                                        <strong>0.026</strong> =
                                                        2.6%
                                                    </span>
                                                )}
                                                {newExpense.calculation_type ===
                                                    'per_mile' && (
                                                    <span className="text-xs text-muted-foreground">
                                                        e.g.{' '}
                                                        <strong>0.20</strong> =
                                                        20¢/mile
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <Label>Effective from</Label>
                                                <WeekPicker
                                                    value={
                                                        newExpense.effective_from
                                                    }
                                                    onChange={(v) =>
                                                        setNewExpense({
                                                            ...newExpense,
                                                            effective_from: v,
                                                        })
                                                    }
                                                />
                                            </div>
                                            <div className="flex flex-col gap-1 sm:col-span-2">
                                                <Label htmlFor="exp-desc">
                                                    Description (optional)
                                                </Label>
                                                <Input
                                                    id="exp-desc"
                                                    value={
                                                        newExpense.description
                                                    }
                                                    onChange={(e) =>
                                                        setNewExpense({
                                                            ...newExpense,
                                                            description:
                                                                e.target.value,
                                                        })
                                                    }
                                                />
                                            </div>
                                            <div className="flex flex-col gap-1 sm:col-span-2">
                                                <Label>
                                                    Applies To{' '}
                                                    <span className="font-normal text-muted-foreground">
                                                        (leave blank for all)
                                                    </span>
                                                </Label>
                                                <ToggleGroup
                                                    type="multiple"
                                                    variant="outline"
                                                    className="justify-start"
                                                    value={
                                                        newExpense.applies_to
                                                    }
                                                    onValueChange={(v) =>
                                                        setNewExpense({
                                                            ...newExpense,
                                                            applies_to: v,
                                                        })
                                                    }
                                                >
                                                    {contractTypes.map((ct) => (
                                                        <ToggleGroupItem
                                                            key={ct.value}
                                                            value={ct.value}
                                                        >
                                                            {ct.label}
                                                        </ToggleGroupItem>
                                                    ))}
                                                </ToggleGroup>
                                            </div>
                                            <div className="sm:col-span-2">
                                                <SkipNoGrossCheckbox
                                                    checked={
                                                        newExpense.skip_when_no_gross
                                                    }
                                                    onChange={(v) =>
                                                        setNewExpense({
                                                            ...newExpense,
                                                            skip_when_no_gross:
                                                                v,
                                                        })
                                                    }
                                                />
                                            </div>
                                        </div>
                                    </form>
                                    <DialogFooter>
                                        <Button
                                            type="submit"
                                            form="add-expense-form"
                                        >
                                            Add Expense
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>

                        {expenses.length > 0 ? (
                            <div className="overflow-x-auto rounded-lg border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Name</TableHead>
                                            <TableHead>Type</TableHead>
                                            <TableHead>Current Rate</TableHead>
                                            <TableHead>Applies To</TableHead>
                                            <TableHead></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {expenses.map((exp) => {
                                            const isEditing =
                                                editingExpense?.id === exp.id;

                                            return (
                                                <TableRow key={exp.id}>
                                                    <TableCell>
                                                        {isEditing ? (
                                                            <Input
                                                                value={
                                                                    editingExpense.name
                                                                }
                                                                onChange={(e) =>
                                                                    setEditingExpense(
                                                                        {
                                                                            ...editingExpense,
                                                                            name: e
                                                                                .target
                                                                                .value,
                                                                        },
                                                                    )
                                                                }
                                                            />
                                                        ) : (
                                                            exp.name
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        {isEditing ? (
                                                            <Select
                                                                value={
                                                                    editingExpense.calculation_type
                                                                }
                                                                onValueChange={(
                                                                    v,
                                                                ) =>
                                                                    setEditingExpense(
                                                                        {
                                                                            ...editingExpense,
                                                                            calculation_type:
                                                                                v,
                                                                        },
                                                                    )
                                                                }
                                                            >
                                                                <SelectTrigger className="w-36">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {calculationTypes.map(
                                                                        (
                                                                            ct,
                                                                        ) => (
                                                                            <SelectItem
                                                                                key={
                                                                                    ct.value
                                                                                }
                                                                                value={
                                                                                    ct.value
                                                                                }
                                                                            >
                                                                                {
                                                                                    ct.label
                                                                                }
                                                                            </SelectItem>
                                                                        ),
                                                                    )}
                                                                </SelectContent>
                                                            </Select>
                                                        ) : (
                                                            (calculationTypes.find(
                                                                (ct) =>
                                                                    ct.value ===
                                                                    exp.calculation_type,
                                                            )?.label ??
                                                            exp.calculation_type)
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="tabular-nums">
                                                        {exp.current_rate !=
                                                        null
                                                            ? fmtExpenseRate(
                                                                  exp.current_rate,
                                                                  exp.calculation_type,
                                                              )
                                                            : '—'}
                                                    </TableCell>
                                                    <TableCell className="text-sm text-muted-foreground">
                                                        {isEditing ? (
                                                            <div className="flex flex-col gap-1">
                                                                <span className="text-xs text-muted-foreground">
                                                                    Applies to
                                                                </span>
                                                                <ToggleGroup
                                                                    type="multiple"
                                                                    variant="outline"
                                                                    size="sm"
                                                                    value={
                                                                        editingExpense.applies_to ??
                                                                        []
                                                                    }
                                                                    onValueChange={(
                                                                        v,
                                                                    ) =>
                                                                        setEditingExpense(
                                                                            {
                                                                                ...editingExpense,
                                                                                applies_to:
                                                                                    v.length >
                                                                                    0
                                                                                        ? v
                                                                                        : null,
                                                                            },
                                                                        )
                                                                    }
                                                                >
                                                                    {contractTypes.map(
                                                                        (
                                                                            ct,
                                                                        ) => (
                                                                            <ToggleGroupItem
                                                                                key={
                                                                                    ct.value
                                                                                }
                                                                                value={
                                                                                    ct.value
                                                                                }
                                                                            >
                                                                                {
                                                                                    ct.label
                                                                                }
                                                                            </ToggleGroupItem>
                                                                        ),
                                                                    )}
                                                                </ToggleGroup>
                                                                <span className="text-xs text-muted-foreground">
                                                                    {!editingExpense.applies_to ||
                                                                    editingExpense
                                                                        .applies_to
                                                                        .length ===
                                                                        0
                                                                        ? 'All contract types'
                                                                        : 'Selected only'}
                                                                </span>
                                                                <label className="mt-1 flex cursor-pointer items-start gap-2 text-xs font-normal">
                                                                    <Checkbox
                                                                        checked={
                                                                            editingExpense.skip_when_no_gross
                                                                        }
                                                                        onCheckedChange={(
                                                                            v,
                                                                        ) =>
                                                                            setEditingExpense(
                                                                                {
                                                                                    ...editingExpense,
                                                                                    skip_when_no_gross:
                                                                                        v ===
                                                                                        true,
                                                                                },
                                                                            )
                                                                        }
                                                                        className="mt-0.5"
                                                                    />
                                                                    <span>
                                                                        Skip
                                                                        when
                                                                        driver
                                                                        has $0
                                                                        gross
                                                                    </span>
                                                                </label>
                                                            </div>
                                                        ) : (
                                                            <span className="flex flex-col gap-0.5">
                                                                <span>
                                                                    {exp.applies_to &&
                                                                    exp
                                                                        .applies_to
                                                                        .length >
                                                                        0
                                                                        ? exp.applies_to
                                                                              .map(
                                                                                  (
                                                                                      v,
                                                                                  ) =>
                                                                                      contractTypes.find(
                                                                                          (
                                                                                              ct,
                                                                                          ) =>
                                                                                              ct.value ===
                                                                                              v,
                                                                                      )
                                                                                          ?.label ??
                                                                                      v,
                                                                              )
                                                                              .join(
                                                                                  ', ',
                                                                              )
                                                                        : 'All'}
                                                                </span>
                                                                {exp.skip_when_no_gross && (
                                                                    <span className="text-xs text-amber-600 dark:text-amber-500">
                                                                        Skips
                                                                        drivers
                                                                        with $0
                                                                        gross
                                                                    </span>
                                                                )}
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {isEditing ? (
                                                            <div className="flex justify-end gap-2">
                                                                <Button
                                                                    size="sm"
                                                                    onClick={
                                                                        saveExpense
                                                                    }
                                                                >
                                                                    Save
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    onClick={() =>
                                                                        setEditingExpense(
                                                                            null,
                                                                        )
                                                                    }
                                                                >
                                                                    Cancel
                                                                </Button>
                                                            </div>
                                                        ) : (
                                                            <div className="flex justify-end gap-2">
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() =>
                                                                        setRateTarget(
                                                                            {
                                                                                kind: 'expense',
                                                                                id: exp.id,
                                                                            },
                                                                        )
                                                                    }
                                                                >
                                                                    Rates
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() =>
                                                                        setEditingExpense(
                                                                            {
                                                                                ...exp,
                                                                            },
                                                                        )
                                                                    }
                                                                >
                                                                    Edit
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="destructive"
                                                                    onClick={() =>
                                                                        deleteExpense(
                                                                            exp.id,
                                                                        )
                                                                    }
                                                                >
                                                                    Delete
                                                                </Button>
                                                            </div>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        ) : (
                            <Empty>
                                <EmptyHeader>
                                    <EmptyMedia variant="icon">
                                        <ReceiptText />
                                    </EmptyMedia>
                                    <EmptyTitle>No team expenses</EmptyTitle>
                                    <EmptyDescription>
                                        Add your first expense to start tracking
                                        team costs.
                                    </EmptyDescription>
                                </EmptyHeader>
                            </Empty>
                        )}
                    </TabsContent>

                    <TabsContent value="imports" className="mt-4">
                        <ImportsTab
                            slug={slug}
                            dataSource={dataSource}
                            canImport={canImport}
                            canChangeDataSource={canChangeDataSource}
                            importSummary={importSummary}
                        />
                    </TabsContent>
                </Tabs>
            </div>

            {activeDriver && (
                <RateHistoryDialog
                    open
                    onOpenChange={(open) => !open && setRateTarget(null)}
                    title={`${activeDriver.driver_name} — tariff history`}
                    rates={activeDriver.rates.map(
                        (r): RateRow => ({
                            id: r.id,
                            rate: r.tariff_rate,
                            effective_from: r.effective_from,
                            effective_to: r.effective_to,
                        }),
                    )}
                    rateLabel="Tariff"
                    rateStep={
                        activeDriver.contract_type === 'company_cpm'
                            ? '0.01'
                            : '0.001'
                    }
                    rateHelp={
                        activeDriver.contract_type !== 'company_cpm'
                            ? 'Enter as a decimal — e.g. 0.30 = 30% of gross.'
                            : 'Dollars per mile — e.g. 0.65.'
                    }
                    formatRate={(rate) =>
                        fmtTariff(rate, activeDriver.contract_type)
                    }
                    onAdd={(rate, eff, to) =>
                        addDriverRate(activeDriver.id, rate, eff, to)
                    }
                    onUpdate={(id, rate, eff, to) =>
                        updateDriverRate(activeDriver.id, id, rate, eff, to)
                    }
                    onDelete={(id) => deleteDriverRate(activeDriver.id, id)}
                />
            )}

            {activeExpense && (
                <RateHistoryDialog
                    open
                    onOpenChange={(open) => !open && setRateTarget(null)}
                    title={`${activeExpense.name} — rate history`}
                    rates={activeExpense.rates.map(
                        (r): RateRow => ({
                            id: r.id,
                            rate: r.rate,
                            effective_from: r.effective_from,
                            effective_to: r.effective_to,
                        }),
                    )}
                    rateLabel="Rate"
                    rateStep={
                        activeExpense.calculation_type === 'percentage_of_gross'
                            ? '0.001'
                            : '0.01'
                    }
                    rateHelp={
                        activeExpense.calculation_type === 'percentage_of_gross'
                            ? 'Enter as a decimal — e.g. 0.026 = 2.6% of gross.'
                            : activeExpense.calculation_type === 'per_mile'
                              ? 'e.g. 0.20 = 20¢/mile.'
                              : undefined
                    }
                    formatRate={(rate) =>
                        fmtExpenseRate(rate, activeExpense.calculation_type)
                    }
                    onAdd={(rate, eff, to) =>
                        addExpenseRate(activeExpense.id, rate, eff, to)
                    }
                    onUpdate={(id, rate, eff, to) =>
                        updateExpenseRateValue(
                            activeExpense.id,
                            id,
                            rate,
                            eff,
                            to,
                        )
                    }
                    onDelete={(id) => deleteExpenseRate(activeExpense.id, id)}
                />
            )}
        </>
    );
}

Configuration.layout = (props: { currentTeam?: { slug: string } | null }) => ({
    breadcrumbs: [
        {
            title: 'Configurations',
            href: props.currentTeam
                ? configurationIndex.url(props.currentTeam.slug)
                : '/',
        },
    ],
});
