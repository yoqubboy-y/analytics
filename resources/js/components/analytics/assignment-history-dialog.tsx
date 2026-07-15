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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WeekPicker, isoMonday } from '@/components/week-picker';

export type AssignmentKind = 'truck' | 'trailer' | 'dispatcher';

export interface AssignmentRow {
    id: number;
    kind: AssignmentKind;
    value: string;
    effective_from: string;
    effective_to: string | null;
}

const KINDS: { kind: AssignmentKind; label: string; placeholder: string }[] = [
    { kind: 'truck', label: 'Truck', placeholder: 'e.g. GL7005' },
    { kind: 'trailer', label: 'Trailer', placeholder: 'e.g. T6330' },
    { kind: 'dispatcher', label: 'Dispatcher', placeholder: 'e.g. Wayne' },
];

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

interface KindPanelProps {
    label: string;
    placeholder: string;
    rows: AssignmentRow[];
    onAdd: (value: string, from: string, to: string | null) => void;
    onUpdate: (
        id: number,
        value: string,
        from: string,
        to: string | null,
    ) => void;
    onDelete: (id: number) => void;
}

function KindPanel({
    label,
    placeholder,
    rows,
    onAdd,
    onUpdate,
    onDelete,
}: KindPanelProps) {
    const [newValue, setNewValue] = useState('');
    const [newWeek, setNewWeek] = useState(isoMonday());
    const [newEnd, setNewEnd] = useState<string | null>(null);

    const [editingId, setEditingId] = useState<number | null>(null);
    const [editValue, setEditValue] = useState('');
    const [editWeek, setEditWeek] = useState(isoMonday());
    const [editEnd, setEditEnd] = useState<string | null>(null);

    function submitNew(e: React.FormEvent) {
        e.preventDefault();
        const value = newValue.trim();

        if (!value) {
            return;
        }

        onAdd(value, newWeek, newEnd);
        setNewValue('');
        setNewWeek(isoMonday());
        setNewEnd(null);
    }

    function startEdit(row: AssignmentRow) {
        setEditingId(row.id);
        setEditValue(row.value);
        setEditWeek(isoMonday(row.effective_from));
        setEditEnd(row.effective_to ? isoMonday(row.effective_to) : null);
    }

    function saveEdit() {
        if (editingId === null) {
            return;
        }

        const value = editValue.trim();

        if (!value) {
            return;
        }

        onUpdate(editingId, value, editWeek, editEnd);
        setEditingId(null);
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="overflow-hidden rounded-lg border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Effective period</TableHead>
                            <TableHead>{label}</TableHead>
                            <TableHead className="text-right" />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.length === 0 && (
                            <TableRow>
                                <TableCell
                                    colSpan={3}
                                    className="py-6 text-center text-sm text-muted-foreground"
                                >
                                    No {label.toLowerCase()} history yet.
                                </TableCell>
                            </TableRow>
                        )}
                        {rows.map((row) => {
                            const isEditing = editingId === row.id;

                            return (
                                <TableRow key={row.id}>
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
                                                {fmtWeek(row.effective_from)}
                                                {' → '}
                                                {row.effective_to ? (
                                                    fmtWeek(row.effective_to)
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
                                                className="h-8 w-36"
                                                value={editValue}
                                                onChange={(e) =>
                                                    setEditValue(e.target.value)
                                                }
                                            />
                                        ) : (
                                            <span className="font-medium tabular-nums">
                                                {row.value}
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
                                                    aria-label={`Edit ${label.toLowerCase()}`}
                                                    onClick={() =>
                                                        startEdit(row)
                                                    }
                                                >
                                                    <PencilIcon className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-8 w-8 text-destructive"
                                                    aria-label={`Delete ${label.toLowerCase()}`}
                                                    onClick={() =>
                                                        onDelete(row.id)
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
                    <Label htmlFor={`new-${label}`}>{label}</Label>
                    <Input
                        id={`new-${label}`}
                        required
                        className="w-36"
                        placeholder={placeholder}
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                    />
                </div>
                <Button type="submit" className="gap-1">
                    <PlusIcon className="h-4 w-4" />
                    Add
                </Button>
            </form>
        </div>
    );
}

interface AssignmentHistoryDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    /** All assignment rows for the driver, any kind. */
    assignments: AssignmentRow[];
    onAdd: (
        kind: AssignmentKind,
        value: string,
        from: string,
        to: string | null,
    ) => void;
    onUpdate: (
        id: number,
        kind: AssignmentKind,
        value: string,
        from: string,
        to: string | null,
    ) => void;
    onDelete: (id: number) => void;
}

export function AssignmentHistoryDialog({
    open,
    onOpenChange,
    title,
    assignments,
    onAdd,
    onUpdate,
    onDelete,
}: AssignmentHistoryDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>
                        Truck, trailer and dispatcher each keep their own dated
                        history. Leave the end open for "ongoing" — it stays in
                        force until a later entry takes over. Reports use the
                        assignment effective during each week.
                    </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="truck">
                    <TabsList className="gap-1 bg-transparent">
                        {KINDS.map((k) => (
                            <TabsTrigger key={k.kind} value={k.kind}>
                                {k.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    {KINDS.map((k) => (
                        <TabsContent
                            key={k.kind}
                            value={k.kind}
                            className="mt-4"
                        >
                            <KindPanel
                                label={k.label}
                                placeholder={k.placeholder}
                                rows={assignments.filter(
                                    (a) => a.kind === k.kind,
                                )}
                                onAdd={(value, from, to) =>
                                    onAdd(k.kind, value, from, to)
                                }
                                onUpdate={(id, value, from, to) =>
                                    onUpdate(id, k.kind, value, from, to)
                                }
                                onDelete={onDelete}
                            />
                        </TabsContent>
                    ))}
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
