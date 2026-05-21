import { Head, router, usePage } from '@inertiajs/react';
import { useId, useState } from 'react';
import {
    destroyExpense,
    index as configurationIndex,
    storeDriverConfig,
    storeExpense,
    updateDriverConfig,
    updateExpense,
} from '@/actions/App/Http/Controllers/Analytics/ConfigurationController';
import { Button } from '@/components/ui/button';
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
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Checkbox } from '@/components/ui/checkbox';
import { ReceiptText } from 'lucide-react';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';

type ContractType = { value: string; label: string };
type CalculationType = { value: string; label: string };

type DriverConfig = {
    id: number;
    external_driver_id: number;
    driver_name: string;
    contract_type: string;
    tariff_rate: number;
};

type TeamExpense = {
    id: number;
    name: string;
    description: string | null;
    calculation_type: string;
    rate: number;
    applies_to: string[] | null;
    skip_when_no_gross: boolean;
    sort_order: number;
};

type Props = {
    driverConfigs: DriverConfig[];
    expenses: TeamExpense[];
    contractTypes: ContractType[];
    calculationTypes: CalculationType[];
};

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
                <p className="text-xs text-muted-foreground" id={`${id}-description`}>
                    Don't charge this expense to drivers who didn't run any loads that week.
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
    applies_to: [] as string[],
    skip_when_no_gross: false,
    sort_order: 0,
};

export default function Configuration({
    driverConfigs,
    expenses,
    contractTypes,
    calculationTypes,
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

    const emptyDriverConfig = { external_driver_id: '', contract_type: contractTypes[0]?.value ?? '', tariff_rate: '' };
    const [newDriverConfig, setNewDriverConfig] = useState({ ...emptyDriverConfig });
    const [addDriverOpen, setAddDriverOpen] = useState(false);

    function submitNewDriverConfig(e: React.FormEvent) {
        e.preventDefault();
        router[storeDriverConfig(slug).method](
            storeDriverConfig.url(slug),
            {
                external_driver_id: parseInt(newDriverConfig.external_driver_id as string),
                contract_type: newDriverConfig.contract_type,
                tariff_rate: parseFloat(newDriverConfig.tariff_rate as string),
            },
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
        tariff_rate: string;
    } | null>(null);

    function startEditDriver(dc: DriverConfig) {
        setEditingDriver({
            id: dc.id,
            contract_type: dc.contract_type,
            tariff_rate: String(dc.tariff_rate),
        });
    }

    function saveDriver() {
        if (!editingDriver) return;
        router[updateDriverConfig([slug, editingDriver.id]).method](
            updateDriverConfig.url([slug, editingDriver.id]),
            {
                contract_type: editingDriver.contract_type,
                tariff_rate: parseFloat(editingDriver.tariff_rate),
            },
            { onSuccess: () => setEditingDriver(null) },
        );
    }

    // --- Team Expense Editing ---
    const [newExpense, setNewExpense] = useState({ ...emptyExpense });
    const [addExpenseOpen, setAddExpenseOpen] = useState(false);
    const [editingExpense, setEditingExpense] = useState<
        (TeamExpense & { rate: string }) | null
    >(null);

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
                    setNewExpense({ ...emptyExpense });
                    setAddExpenseOpen(false);
                },
            },
        );
    }

    function saveExpense() {
        if (!editingExpense) return;
        router[updateExpense([slug, editingExpense.id]).method](
            updateExpense.url([slug, editingExpense.id]),
            {
                name: editingExpense.name,
                description: editingExpense.description,
                calculation_type: editingExpense.calculation_type,
                rate: parseFloat(editingExpense.rate as string),
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
        if (!confirm('Delete this expense?')) return;
        router[destroyExpense([slug, id]).method](destroyExpense.url([slug, id]));
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
                    </TabsList>

                    {/* Driver Contracts Tab */}
                    <TabsContent value="drivers" className="mt-4">
                        <div className="mb-4 flex justify-end">
                            <Dialog open={addDriverOpen} onOpenChange={setAddDriverOpen}>
                                <DialogTrigger asChild>
                                    <Button size="sm">Add Driver Config</Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Add Driver Config</DialogTitle>
                                    </DialogHeader>
                                    <form id="add-driver-config-form" onSubmit={submitNewDriverConfig}>
                                        <div className="flex flex-col gap-4">
                                            <div className="flex flex-col gap-1">
                                                <Label htmlFor="dc-driver-id">Driver ID</Label>
                                                <Input
                                                    id="dc-driver-id"
                                                    type="number"
                                                    min="1"
                                                    required
                                                    value={newDriverConfig.external_driver_id}
                                                    onChange={(e) =>
                                                        setNewDriverConfig({
                                                            ...newDriverConfig,
                                                            external_driver_id: e.target.value,
                                                        })
                                                    }
                                                    placeholder="e.g. 42"
                                                />
                                            </div>
                                            <div className="flex gap-4">
                                                <div className="flex flex-1 flex-col gap-1">
                                                    <Label htmlFor="dc-contract-type">Contract Type</Label>
                                                    <Select
                                                        value={newDriverConfig.contract_type}
                                                        onValueChange={(v) =>
                                                            setNewDriverConfig({
                                                                ...newDriverConfig,
                                                                contract_type: v,
                                                            })
                                                        }
                                                    >
                                                        <SelectTrigger id="dc-contract-type">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {contractTypes.map((ct) => (
                                                                <SelectItem key={ct.value} value={ct.value}>
                                                                    {ct.label}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="flex w-32 flex-col gap-1">
                                                    <Label htmlFor="dc-rate">Rate</Label>
                                                    <Input
                                                        id="dc-rate"
                                                        type="number"
                                                        step={newDriverConfig.contract_type === 'company_cpm' ? '0.01' : '0.001'}
                                                        min="0"
                                                        required
                                                        value={newDriverConfig.tariff_rate}
                                                        onChange={(e) =>
                                                            setNewDriverConfig({
                                                                ...newDriverConfig,
                                                                tariff_rate: e.target.value,
                                                            })
                                                        }
                                                        placeholder={newDriverConfig.contract_type === 'company_cpm' ? '0.65' : '0.30'}
                                                    />
                                                    {newDriverConfig.contract_type !== 'company_cpm' && (
                                                        <span className="text-xs text-muted-foreground">
                                                            e.g. <strong>0.30</strong> = 30%
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </form>
                                    <DialogFooter>
                                        <Button type="submit" form="add-driver-config-form">Add Config</Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>

                        <div className="overflow-x-auto rounded-lg border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Driver</TableHead>
                                        <TableHead>Contract Type</TableHead>
                                        <TableHead>Rate</TableHead>
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
                                                <TableCell>
                                                    {isEditing ? (
                                                        <Input
                                                            type="number"
                                                            step="0.01"
                                                            className="w-28"
                                                            value={
                                                                editingDriver.tariff_rate
                                                            }
                                                            onChange={(e) =>
                                                                setEditingDriver(
                                                                    {
                                                                        ...editingDriver,
                                                                        tariff_rate:
                                                                            e
                                                                                .target
                                                                                .value,
                                                                    },
                                                                )
                                                            }
                                                        />
                                                    ) : (
                                                        dc.tariff_rate
                                                    )}
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
                            <Dialog open={addExpenseOpen} onOpenChange={setAddExpenseOpen}>
                                <DialogTrigger asChild>
                                    <Button size="sm">Add Expense</Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Add Expense</DialogTitle>
                                    </DialogHeader>
                                    <form id="add-expense-form" onSubmit={submitNewExpense}>
                                        <div className="grid gap-4 sm:grid-cols-2">
                                            <div className="flex flex-col gap-1">
                                                <Label htmlFor="exp-name">Name</Label>
                                                <Input
                                                    id="exp-name"
                                                    required
                                                    value={newExpense.name}
                                                    onChange={(e) =>
                                                        setNewExpense({
                                                            ...newExpense,
                                                            name: e.target.value,
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
                                                    value={newExpense.calculation_type}
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
                                                        {calculationTypes.map((ct) => (
                                                            <SelectItem
                                                                key={ct.value}
                                                                value={ct.value}
                                                            >
                                                                {ct.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <Label htmlFor="exp-rate">Rate</Label>
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
                                                            rate: e.target.value,
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
                                                        <strong>0.026</strong> = 2.6%
                                                    </span>
                                                )}
                                                {newExpense.calculation_type ===
                                                    'per_mile' && (
                                                    <span className="text-xs text-muted-foreground">
                                                        e.g. <strong>0.20</strong> =
                                                        20¢/mile
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex flex-col gap-1 sm:col-span-2">
                                                <Label htmlFor="exp-desc">
                                                    Description (optional)
                                                </Label>
                                                <Input
                                                    id="exp-desc"
                                                    value={newExpense.description}
                                                    onChange={(e) =>
                                                        setNewExpense({
                                                            ...newExpense,
                                                            description: e.target.value,
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
                                                    value={newExpense.applies_to}
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
                                                    checked={newExpense.skip_when_no_gross}
                                                    onChange={(v) =>
                                                        setNewExpense({
                                                            ...newExpense,
                                                            skip_when_no_gross: v,
                                                        })
                                                    }
                                                />
                                            </div>
                                        </div>
                                    </form>
                                    <DialogFooter>
                                        <Button type="submit" form="add-expense-form">
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
                                            <TableHead>Rate</TableHead>
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
                                                    <TableCell>
                                                        {isEditing ? (
                                                            <div className="flex flex-col gap-1">
                                                                <Input
                                                                    type="number"
                                                                    step={
                                                                        editingExpense.calculation_type ===
                                                                        'percentage_of_gross'
                                                                            ? '0.001'
                                                                            : '0.01'
                                                                    }
                                                                    className="w-28"
                                                                    value={
                                                                        editingExpense.rate
                                                                    }
                                                                    onChange={(
                                                                        e,
                                                                    ) =>
                                                                        setEditingExpense(
                                                                            {
                                                                                ...editingExpense,
                                                                                rate: e
                                                                                    .target
                                                                                    .value,
                                                                            },
                                                                        )
                                                                    }
                                                                />
                                                                {editingExpense.calculation_type ===
                                                                    'percentage_of_gross' && (
                                                                    <span className="text-xs text-muted-foreground">
                                                                        e.g.
                                                                        0.026 =
                                                                        2.6%
                                                                    </span>
                                                                )}
                                                                {editingExpense.calculation_type ===
                                                                    'per_mile' && (
                                                                    <span className="text-xs text-muted-foreground">
                                                                        e.g.
                                                                        0.20 =
                                                                        20¢/mile
                                                                    </span>
                                                                )}
                                                            </div>
                                                        ) : exp.calculation_type ===
                                                          'percentage_of_gross' ? (
                                                            `${(exp.rate * 100).toFixed(2)}%`
                                                        ) : (
                                                            exp.rate
                                                        )}
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
                                                                        checked={editingExpense.skip_when_no_gross}
                                                                        onCheckedChange={(v) =>
                                                                            setEditingExpense({
                                                                                ...editingExpense,
                                                                                skip_when_no_gross: v === true,
                                                                            })
                                                                        }
                                                                        className="mt-0.5"
                                                                    />
                                                                    <span>Skip when driver has $0 gross</span>
                                                                </label>
                                                            </div>
                                                        ) : (
                                                            <span className="flex flex-col gap-0.5">
                                                                <span>
                                                                    {exp.applies_to && exp.applies_to.length > 0
                                                                        ? exp.applies_to
                                                                              .map(
                                                                                  (v) =>
                                                                                      contractTypes.find(
                                                                                          (ct) => ct.value === v,
                                                                                      )?.label ?? v,
                                                                              )
                                                                              .join(', ')
                                                                        : 'All'}
                                                                </span>
                                                                {exp.skip_when_no_gross && (
                                                                    <span className="text-xs text-amber-600 dark:text-amber-500">
                                                                        Skips drivers with $0 gross
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
                                                                        setEditingExpense(
                                                                            {
                                                                                ...exp,
                                                                                rate: String(
                                                                                    exp.rate,
                                                                                ),
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
                                        Add your first expense to start tracking team costs.
                                    </EmptyDescription>
                                </EmptyHeader>
                            </Empty>
                        )}
                    </TabsContent>
                </Tabs>
            </div>
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

