import { router } from '@inertiajs/react';
import { useEffect, useMemo, useState } from 'react';
import { storeDriverConfig } from '@/actions/App/Http/Controllers/Analytics/ConfigurationController';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { isoMonday } from '@/components/week-picker';

export type DialogContractType = { value: string; label: string };

export type DialogImportedDriver = {
    external_driver_key: string;
    driver_name: string;
    truck_number: string | null;
};

interface AddDriverConfigDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    slug: string;
    dataSource: 'analytics_db' | 'xlsx';
    contractTypes: DialogContractType[];
    importedDrivers: DialogImportedDriver[];
    /** Keys already attached to a config — used to filter the XLSX picker. */
    takenDriverKeys: Set<string>;
    /**
     * Optional pre-fill for the driver identity. When opened from the PnL
     * table, the picker / numeric field starts populated so the user only
     * needs to enter contract + rate.
     */
    prefill?: {
        external_driver_id?: string;
        external_driver_key?: string;
        driver_name?: string;
    } | null;
    /** Where to send the user / refresh after a successful save. */
    onSuccess?: () => void;
}

export function AddDriverConfigDialog({
    open,
    onOpenChange,
    slug,
    dataSource,
    contractTypes,
    importedDrivers,
    takenDriverKeys,
    prefill,
    onSuccess,
}: AddDriverConfigDialogProps) {
    const isXlsx = dataSource === 'xlsx';

    const emptyState = useMemo(
        () => ({
            external_driver_id: '',
            external_driver_key: '',
            dispatcher: '',
            contract_type: contractTypes[0]?.value ?? '',
            tariff_rate: '',
            effective_from: isoMonday(),
        }),
        [contractTypes],
    );

    const [form, setForm] = useState(emptyState);

    // Reset / re-apply pre-fill every time the dialog opens.
    useEffect(() => {
        if (open) {
            setForm({
                ...emptyState,
                external_driver_id: prefill?.external_driver_id ?? '',
                external_driver_key: prefill?.external_driver_key ?? '',
            });
        }
    }, [open, prefill, emptyState]);

    // XLSX picker only offers drivers without a config yet, plus the
    // pre-filled driver so the prefill stays visible even when it's
    // technically "taken" (shouldn't be, but defends against race).
    const pickerOptions = useMemo(() => {
        return importedDrivers.filter(
            (d) =>
                !takenDriverKeys.has(d.external_driver_key) ||
                d.external_driver_key === prefill?.external_driver_key,
        );
    }, [importedDrivers, takenDriverKeys, prefill]);

    function submit(e: React.FormEvent) {
        e.preventDefault();
        const payload: Record<string, unknown> = {
            contract_type: form.contract_type,
            tariff_rate: parseFloat(form.tariff_rate),
            effective_from: form.effective_from,
            dispatcher: form.dispatcher.trim() || null,
        };

        if (isXlsx) {
            payload.external_driver_key = form.external_driver_key;
        } else {
            payload.external_driver_id = parseInt(form.external_driver_id);
        }

        router[storeDriverConfig(slug).method](
            storeDriverConfig.url(slug),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            payload as any,
            {
                preserveScroll: true,
                onSuccess: () => {
                    onOpenChange(false);
                    setForm(emptyState);
                    onSuccess?.();
                },
            },
        );
    }

    const driverName = prefill?.driver_name;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {driverName
                            ? `Configure ${driverName}`
                            : 'Add Driver Config'}
                    </DialogTitle>
                </DialogHeader>

                <form id="add-driver-config-form" onSubmit={submit}>
                    <div className="flex flex-col gap-4">
                        {isXlsx ? (
                            <div className="flex flex-col gap-1">
                                <Label htmlFor="adcd-driver-key">
                                    Driver (from imports)
                                </Label>
                                <Select
                                    value={form.external_driver_key}
                                    onValueChange={(v) =>
                                        setForm({ ...form, external_driver_key: v })
                                    }
                                >
                                    <SelectTrigger id="adcd-driver-key">
                                        <SelectValue placeholder="Pick a driver…" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {pickerOptions.length === 0 && (
                                            <div className="px-3 py-2 text-xs text-muted-foreground">
                                                {importedDrivers.length === 0
                                                    ? 'No imported drivers yet — upload a workbook first.'
                                                    : 'Every imported driver already has a config.'}
                                            </div>
                                        )}
                                        {pickerOptions.map((d) => (
                                            <SelectItem
                                                key={d.external_driver_key}
                                                value={d.external_driver_key}
                                            >
                                                {d.driver_name}
                                                {d.truck_number
                                                    ? ` · ${d.truck_number}`
                                                    : ''}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-1">
                                <Label htmlFor="adcd-driver-id">Driver ID</Label>
                                <Input
                                    id="adcd-driver-id"
                                    type="number"
                                    min="1"
                                    required
                                    value={form.external_driver_id}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            external_driver_id: e.target.value,
                                        })
                                    }
                                    placeholder="e.g. 42"
                                />
                            </div>
                        )}

                        <div className="flex flex-col gap-1">
                            <Label htmlFor="adcd-dispatcher">
                                Dispatcher{' '}
                                <span className="text-xs font-normal text-muted-foreground">
                                    (optional)
                                </span>
                            </Label>
                            <Input
                                id="adcd-dispatcher"
                                value={form.dispatcher}
                                onChange={(e) =>
                                    setForm({ ...form, dispatcher: e.target.value })
                                }
                                placeholder="e.g. Aidan Scott"
                            />
                        </div>

                        <div className="flex gap-4">
                            <div className="flex flex-1 flex-col gap-1">
                                <Label htmlFor="adcd-contract-type">
                                    Contract Type
                                </Label>
                                <Select
                                    value={form.contract_type}
                                    onValueChange={(v) =>
                                        setForm({ ...form, contract_type: v })
                                    }
                                >
                                    <SelectTrigger id="adcd-contract-type">
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
                                <Label htmlFor="adcd-rate">Rate</Label>
                                <Input
                                    id="adcd-rate"
                                    type="number"
                                    step={form.contract_type === 'company_cpm' ? '0.01' : '0.001'}
                                    min="0"
                                    required
                                    value={form.tariff_rate}
                                    onChange={(e) =>
                                        setForm({ ...form, tariff_rate: e.target.value })
                                    }
                                    placeholder={
                                        form.contract_type === 'company_cpm'
                                            ? '0.65'
                                            : '0.30'
                                    }
                                />
                                {form.contract_type !== 'company_cpm' && (
                                    <span className="text-xs text-muted-foreground">
                                        e.g. <strong>0.30</strong> = 30%
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="flex flex-col gap-1">
                            <Label htmlFor="adcd-effective-from">Effective from</Label>
                            <Input
                                id="adcd-effective-from"
                                type="date"
                                required
                                value={form.effective_from}
                                onChange={(e) =>
                                    setForm({ ...form, effective_from: e.target.value })
                                }
                            />
                            <span className="text-xs text-muted-foreground">
                                The first week this rate applies. Earlier weeks reuse
                                this rate for continuity.
                            </span>
                        </div>
                    </div>
                </form>

                <DialogFooter>
                    <Button type="submit" form="add-driver-config-form">
                        Save
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
