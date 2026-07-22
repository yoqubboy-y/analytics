import { format } from 'date-fns';
import { CheckIcon, ChevronsUpDownIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useMemo, useState } from 'react';
import type React from 'react';
import { Button } from '@/components/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
import { WeekPicker, isoMonday } from '@/components/week-picker';
import { cn } from '@/lib/utils';

export type PaidBy = 'company' | 'driver';

export interface AttributionRow {
    id: number;
    driver_config_id: number;
    driver_name: string;
    week_start: string;
    amount: number;
    paid_by: PaidBy;
    note: string | null;
}

export interface TruckAssignment {
    value: string;
    effective_from: string;
    effective_to: string | null;
}

export interface DriverOption {
    id: number;
    name: string;
    /** This driver's truck-assignment history, for resolving the unit per week. */
    truckAssignments: TruckAssignment[];
}

/**
 * The truck a driver ran in the given ISO week — the assignment whose
 * [effective_from, effective_to] covers it, most recent effective_from winning
 * (mirrors the backend `DriverConfig::assignmentAsOf`). ISO date strings sort
 * lexically, so string comparison is safe here.
 */
function unitForWeek(assignments: TruckAssignment[], week: string): string | null {
    const covering = assignments.filter(
        (a) =>
            a.effective_from <= week &&
            (a.effective_to === null || a.effective_to >= week),
    );

    if (covering.length > 0) {
        // Most recent effective_from wins when several cover the week.
        covering.sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));

        return covering[0].value;
    }

    if (assignments.length === 0) {
        return null;
    }

    // A week before any assignment begins falls back to the earliest one, for
    // continuity — same as the backend `assignmentAsOf`.
    const earliest = [...assignments].sort((a, b) =>
        a.effective_from < b.effective_from ? -1 : 1,
    )[0];

    return week < earliest.effective_from ? earliest.value : null;
}

interface ExpenseAttributionsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    subtitle?: string;
    /** Configured drivers on this team, for the picker. */
    drivers: DriverOption[];
    /** Attributions sorted newest week first (as sent from the server). */
    attributions: AttributionRow[];
    onAdd: (
        driverConfigId: number,
        weekStart: string,
        amount: number,
        paidBy: PaidBy,
        note: string | null,
    ) => void;
    onUpdate: (
        id: number,
        driverConfigId: number,
        weekStart: string,
        amount: number,
        paidBy: PaidBy,
        note: string | null,
    ) => void;
    onDelete: (id: number) => void;
}

const fmtWeek = (eff: string) =>
    format(new Date(eff + 'T00:00:00'), 'MMM d, yyyy');

const fmtMoney = (n: number) =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/**
 * Searchable driver picker (Popover + Command) — teams can carry 100+ configs.
 * Matches on both the driver name and the truck/unit they ran in `week`, and
 * shows that unit alongside each name so you can find a driver by their truck.
 */
function DriverCombobox({
    drivers,
    value,
    week,
    onChange,
}: {
    drivers: DriverOption[];
    value: number | null;
    week: string;
    onChange: (id: number) => void;
}) {
    const [open, setOpen] = useState(false);
    const selected = drivers.find((d) => d.id === value) ?? null;
    const selectedUnit = selected
        ? unitForWeek(selected.truckAssignments, week)
        : null;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="h-9 w-56 justify-between font-normal"
                >
                    <span className={cn('truncate', !selected && 'text-muted-foreground')}>
                        {selected
                            ? selectedUnit
                                ? `${selected.name} · ${selectedUnit}`
                                : selected.name
                            : 'Select driver or unit…'}
                    </span>
                    <ChevronsUpDownIcon className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="start">
                <Command>
                    <CommandInput placeholder="Search driver or unit…" />
                    <CommandList>
                        <CommandEmpty>No driver found.</CommandEmpty>
                        <CommandGroup>
                            {drivers.map((d) => {
                                const unit = unitForWeek(d.truckAssignments, week);

                                return (
                                    <CommandItem
                                        key={d.id}
                                        value={d.name}
                                        keywords={unit ? [unit] : undefined}
                                        onSelect={() => {
                                            onChange(d.id);
                                            setOpen(false);
                                        }}
                                    >
                                        <CheckIcon
                                            className={cn(
                                                'mr-2 h-4 w-4',
                                                d.id === value
                                                    ? 'opacity-100'
                                                    : 'opacity-0',
                                            )}
                                        />
                                        <span className="truncate">{d.name}</span>
                                        {unit && (
                                            <span className="ml-auto pl-2 text-xs text-muted-foreground">
                                                {unit}
                                            </span>
                                        )}
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

export function ExpenseAttributionsDialog({
    open,
    onOpenChange,
    title,
    subtitle,
    drivers,
    attributions,
    onAdd,
    onUpdate,
    onDelete,
}: ExpenseAttributionsDialogProps) {
    const [newDriver, setNewDriver] = useState<number | null>(null);
    const [newWeek, setNewWeek] = useState(isoMonday());
    const [newAmount, setNewAmount] = useState('');
    const [newPaidBy, setNewPaidBy] = useState<PaidBy>('company');
    const [newNote, setNewNote] = useState('');

    const [editingId, setEditingId] = useState<number | null>(null);
    const [editDriver, setEditDriver] = useState<number | null>(null);
    const [editWeek, setEditWeek] = useState(isoMonday());
    const [editAmount, setEditAmount] = useState('');
    const [editPaidBy, setEditPaidBy] = useState<PaidBy>('company');
    const [editNote, setEditNote] = useState('');

    // Net across the listed attributions: company-paid is carrier cost,
    // driver-paid nets out (a pass-through the driver covers).
    const net = useMemo(
        () =>
            attributions.reduce(
                (sum, a) =>
                    sum + (a.paid_by === 'driver' ? -a.amount : a.amount),
                0,
            ),
        [attributions],
    );

    function submitNew(e: React.FormEvent) {
        e.preventDefault();
        const value = parseFloat(newAmount);

        if (newDriver === null || Number.isNaN(value)) {
            return;
        }

        onAdd(newDriver, newWeek, value, newPaidBy, newNote.trim() || null);
        setNewDriver(null);
        setNewWeek(isoMonday());
        setNewAmount('');
        setNewPaidBy('company');
        setNewNote('');
    }

    function startEdit(a: AttributionRow) {
        setEditingId(a.id);
        setEditDriver(a.driver_config_id);
        setEditWeek(isoMonday(a.week_start));
        setEditAmount(String(a.amount));
        setEditPaidBy(a.paid_by);
        setEditNote(a.note ?? '');
    }

    function saveEdit() {
        const value = parseFloat(editAmount);

        if (editingId === null || editDriver === null || Number.isNaN(value)) {
            return;
        }

        onUpdate(
            editingId,
            editDriver,
            editWeek,
            value,
            editPaidBy,
            editNote.trim() || null,
        );
        setEditingId(null);
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>
                        {subtitle ??
                            'Attribute this expense to a driver for one ISO week. Company-paid counts as a real carrier cost; driver-paid is a pass-through the driver covers (shown as a credit, kept out of Total Exp.). Actual-mode reports sum these per driver, per week.'}
                    </DialogDescription>
                </DialogHeader>

                <div className="max-h-72 overflow-auto rounded-lg border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Driver</TableHead>
                                <TableHead>Week</TableHead>
                                <TableHead className="text-right">
                                    Amount
                                </TableHead>
                                <TableHead>Paid by</TableHead>
                                <TableHead>Note</TableHead>
                                <TableHead className="text-right" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {attributions.length === 0 ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={6}
                                        className="py-6 text-center text-sm text-muted-foreground"
                                    >
                                        No attributions yet. Add one below.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                attributions.map((a) => {
                                    const isEditing = editingId === a.id;

                                    return (
                                        <TableRow key={a.id}>
                                            <TableCell>
                                                {isEditing ? (
                                                    <DriverCombobox
                                                        drivers={drivers}
                                                        value={editDriver}
                                                        week={editWeek}
                                                        onChange={setEditDriver}
                                                    />
                                                ) : (
                                                    <span className="whitespace-nowrap">
                                                        {a.driver_name}
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {isEditing ? (
                                                    <WeekPicker
                                                        value={editWeek}
                                                        onChange={setEditWeek}
                                                        className="h-8"
                                                    />
                                                ) : (
                                                    <span className="whitespace-nowrap">
                                                        {fmtWeek(a.week_start)}
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {isEditing ? (
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        className="h-8 w-28"
                                                        value={editAmount}
                                                        onChange={(e) =>
                                                            setEditAmount(
                                                                e.target.value,
                                                            )
                                                        }
                                                    />
                                                ) : (
                                                    fmtMoney(a.amount)
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {isEditing ? (
                                                    <PaidBySelect
                                                        value={editPaidBy}
                                                        onChange={setEditPaidBy}
                                                    />
                                                ) : (
                                                    <PaidByBadge
                                                        value={a.paid_by}
                                                    />
                                                )}
                                            </TableCell>
                                            <TableCell className="max-w-40">
                                                {isEditing ? (
                                                    <Input
                                                        className="h-8"
                                                        placeholder="Optional"
                                                        value={editNote}
                                                        onChange={(e) =>
                                                            setEditNote(
                                                                e.target.value,
                                                            )
                                                        }
                                                    />
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">
                                                        {a.note ?? '—'}
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {isEditing ? (
                                                    <div className="flex justify-end gap-2">
                                                        <Button
                                                            size="sm"
                                                            onClick={saveEdit}
                                                        >
                                                            Save
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() =>
                                                                setEditingId(
                                                                    null,
                                                                )
                                                            }
                                                        >
                                                            Cancel
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <div className="flex justify-end gap-1">
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="h-8 w-8"
                                                            aria-label="Edit attribution"
                                                            onClick={() =>
                                                                startEdit(a)
                                                            }
                                                        >
                                                            <PencilIcon className="h-3.5 w-3.5" />
                                                        </Button>
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="h-8 w-8 text-destructive"
                                                            aria-label="Delete attribution"
                                                            onClick={() =>
                                                                onDelete(a.id)
                                                            }
                                                        >
                                                            <Trash2Icon className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </div>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>

                {attributions.length > 0 && (
                    <div className="flex justify-end gap-2 text-sm">
                        <span className="text-muted-foreground">
                            Net (company − driver):
                        </span>
                        <span className="font-medium tabular-nums">
                            {fmtMoney(net)}
                        </span>
                    </div>
                )}

                <form
                    onSubmit={submitNew}
                    className="flex flex-wrap items-end gap-3 border-t pt-4"
                >
                    <div className="flex flex-col gap-1">
                        <Label>Driver</Label>
                        <DriverCombobox
                            drivers={drivers}
                            value={newDriver}
                            week={newWeek}
                            onChange={setNewDriver}
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <Label>Week</Label>
                        <WeekPicker value={newWeek} onChange={setNewWeek} />
                    </div>
                    <div className="flex flex-col gap-1">
                        <Label htmlFor="new-attr-amount">Amount</Label>
                        <Input
                            id="new-attr-amount"
                            type="number"
                            step="0.01"
                            required
                            className="w-32"
                            value={newAmount}
                            onChange={(e) => setNewAmount(e.target.value)}
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <Label>Paid by</Label>
                        <PaidBySelect value={newPaidBy} onChange={setNewPaidBy} />
                    </div>
                    <div className="flex flex-1 flex-col gap-1">
                        <Label htmlFor="new-attr-note">Note (optional)</Label>
                        <Input
                            id="new-attr-note"
                            className="min-w-32"
                            placeholder="e.g. WO #1234"
                            value={newNote}
                            onChange={(e) => setNewNote(e.target.value)}
                        />
                    </div>
                    <Button type="submit" className="gap-1" disabled={newDriver === null}>
                        <PlusIcon className="h-4 w-4" />
                        Add
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function PaidBySelect({
    value,
    onChange,
}: {
    value: PaidBy;
    onChange: (v: PaidBy) => void;
}) {
    return (
        <Select value={value} onValueChange={(v) => onChange(v as PaidBy)}>
            <SelectTrigger className="w-32">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="company">Company</SelectItem>
                <SelectItem value="driver">Driver</SelectItem>
            </SelectContent>
        </Select>
    );
}

function PaidByBadge({ value }: { value: PaidBy }) {
    return value === 'driver' ? (
        <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
            Driver
        </span>
    ) : (
        <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            Company
        </span>
    );
}
