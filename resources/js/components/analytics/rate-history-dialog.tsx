import { format } from 'date-fns';
import { PencilIcon, PlusIcon, Trash2Icon, XIcon } from 'lucide-react';
import { useState } from 'react';
import type React from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { WeekPicker, isoMonday } from '@/components/week-picker';

export interface RateRow {
    id: number;
    rate: number;
    effective_from: string;
    effective_to: string | null;
}

interface RateHistoryDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    subtitle?: string;
    /** Rates sorted newest effective date first (as sent from the server). */
    rates: RateRow[];
    rateLabel: string;
    rateStep: string;
    rateHelp?: React.ReactNode;
    formatRate: (rate: number) => string;
    onAdd: (
        rate: number,
        effectiveFrom: string,
        effectiveTo: string | null,
    ) => void;
    onUpdate: (
        id: number,
        rate: number,
        effectiveFrom: string,
        effectiveTo: string | null,
    ) => void;
    onDelete: (id: number) => void;
}

const fmtWeek = (eff: string) =>
    format(new Date(eff + 'T00:00:00'), 'MMM d, yyyy');

/** Optional end-of-period picker: "ongoing" until an end week is added. */
function EndWeekField({
    value,
    fromValue,
    onChange,
}: {
    value: string | null;
    fromValue: string;
    onChange: (v: string | null) => void;
}) {
    if (value === null) {
        return (
            <Button
                type="button"
                variant="outline"
                className="h-8 gap-1 text-muted-foreground"
                onClick={() => onChange(isoMonday(fromValue))}
            >
                <PlusIcon className="h-3.5 w-3.5" />
                End date
            </Button>
        );
    }

    return (
        <div className="flex items-center gap-1">
            <WeekPicker value={value} onChange={onChange} className="h-8" />
            <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                aria-label="Clear end date (ongoing)"
                onClick={() => onChange(null)}
            >
                <XIcon className="h-3.5 w-3.5" />
            </Button>
        </div>
    );
}

export function RateHistoryDialog({
    open,
    onOpenChange,
    title,
    subtitle,
    rates,
    rateLabel,
    rateStep,
    rateHelp,
    formatRate,
    onAdd,
    onUpdate,
    onDelete,
}: RateHistoryDialogProps) {
    const [newRate, setNewRate] = useState('');
    const [newWeek, setNewWeek] = useState(isoMonday());
    const [newEnd, setNewEnd] = useState<string | null>(null);

    const [editingId, setEditingId] = useState<number | null>(null);
    const [editRate, setEditRate] = useState('');
    const [editWeek, setEditWeek] = useState(isoMonday());
    const [editEnd, setEditEnd] = useState<string | null>(null);

    const canDelete = rates.length > 1;

    function submitNew(e: React.FormEvent) {
        e.preventDefault();
        const value = parseFloat(newRate);

        if (Number.isNaN(value)) {
            return;
        }

        onAdd(value, newWeek, newEnd);
        setNewRate('');
        setNewWeek(isoMonday());
        setNewEnd(null);
    }

    function startEdit(rate: RateRow) {
        setEditingId(rate.id);
        setEditRate(String(rate.rate));
        setEditWeek(isoMonday(rate.effective_from));
        setEditEnd(rate.effective_to ? isoMonday(rate.effective_to) : null);
    }

    function saveEdit() {
        if (editingId === null) {
            return;
        }

        const value = parseFloat(editRate);

        if (Number.isNaN(value)) {
            return;
        }

        onUpdate(editingId, value, editWeek, editEnd);
        setEditingId(null);
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>
                        {subtitle ??
                            'Each rate applies for its period. Leave the end open for "ongoing" — it stays in force until a later rate takes over. Reports use the rate effective during each week.'}
                    </DialogDescription>
                </DialogHeader>

                <div className="overflow-hidden rounded-lg border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Effective period</TableHead>
                                <TableHead>{rateLabel}</TableHead>
                                <TableHead className="text-right" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rates.map((rate) => {
                                const isEditing = editingId === rate.id;

                                return (
                                    <TableRow key={rate.id}>
                                        <TableCell>
                                            {isEditing ? (
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <WeekPicker
                                                        value={editWeek}
                                                        onChange={setEditWeek}
                                                        className="h-8"
                                                    />
                                                    <span className="text-muted-foreground">
                                                        →
                                                    </span>
                                                    <EndWeekField
                                                        value={editEnd}
                                                        fromValue={editWeek}
                                                        onChange={setEditEnd}
                                                    />
                                                </div>
                                            ) : (
                                                <span className="whitespace-nowrap">
                                                    {fmtWeek(
                                                        rate.effective_from,
                                                    )}
                                                    {' → '}
                                                    {rate.effective_to ? (
                                                        fmtWeek(
                                                            rate.effective_to,
                                                        )
                                                    ) : (
                                                        <span className="text-muted-foreground">
                                                            ongoing
                                                        </span>
                                                    )}
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {isEditing ? (
                                                <Input
                                                    type="number"
                                                    step={rateStep}
                                                    min="0"
                                                    className="h-8 w-28"
                                                    value={editRate}
                                                    onChange={(e) =>
                                                        setEditRate(
                                                            e.target.value,
                                                        )
                                                    }
                                                />
                                            ) : (
                                                formatRate(rate.rate)
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
                                                            setEditingId(null)
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
                                                        aria-label="Edit rate"
                                                        onClick={() =>
                                                            startEdit(rate)
                                                        }
                                                    >
                                                        <PencilIcon className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        className="h-8 w-8 text-destructive disabled:opacity-30"
                                                        aria-label="Delete rate"
                                                        disabled={!canDelete}
                                                        title={
                                                            canDelete
                                                                ? undefined
                                                                : 'Keep at least one rate'
                                                        }
                                                        onClick={() =>
                                                            onDelete(rate.id)
                                                        }
                                                    >
                                                        <Trash2Icon className="h-3.5 w-3.5" />
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

                <form
                    onSubmit={submitNew}
                    className="flex flex-wrap items-end gap-3 border-t pt-4"
                >
                    <div className="flex flex-col gap-1">
                        <Label>Effective from</Label>
                        <WeekPicker value={newWeek} onChange={setNewWeek} />
                    </div>
                    <div className="flex flex-col gap-1">
                        <Label>Until (optional)</Label>
                        <EndWeekField
                            value={newEnd}
                            fromValue={newWeek}
                            onChange={setNewEnd}
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <Label htmlFor="new-rate">{rateLabel}</Label>
                        <Input
                            id="new-rate"
                            type="number"
                            step={rateStep}
                            min="0"
                            required
                            className="w-32"
                            value={newRate}
                            onChange={(e) => setNewRate(e.target.value)}
                        />
                    </div>
                    <Button type="submit" className="gap-1">
                        <PlusIcon className="h-4 w-4" />
                        Add rate
                    </Button>
                    {rateHelp && (
                        <p className="w-full text-xs text-muted-foreground">
                            {rateHelp}
                        </p>
                    )}
                </form>
            </DialogContent>
        </Dialog>
    );
}
