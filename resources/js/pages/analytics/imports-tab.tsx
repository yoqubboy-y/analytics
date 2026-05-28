import { router } from '@inertiajs/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
    listImports,
    storeXlsx,
    updateDataSource,
} from '@/actions/App/Http/Controllers/Analytics/ImportController';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { parseAmazonWorkbook } from '@/lib/imports/amazon';
import { parseZeegotPoWorkbook } from '@/lib/imports/zeegot-po';
import type { ImportPayload, ParseResult } from '@/lib/imports/types';

type SourceFormat = 'amazon' | 'zeegot_po';

type ImportStatus = 'queued' | 'processing' | 'completed' | 'failed';

type ImportRecord = {
    id: number;
    source_format: string;
    source_filename: string | null;
    total_sheets: number;
    total_rows: number;
    status: ImportStatus;
    error_message: string | null;
    started_at: string | null;
    completed_at: string | null;
    created_at: string | null;
};

type ImportSummary = {
    total_rows: number;
    min_date: string | null;
    max_date: string | null;
    last_filename: string | null;
    last_format: string | null;
    last_imported_at: string | null;
};

interface ImportsTabProps {
    slug: string;
    dataSource: 'analytics_db' | 'xlsx';
    canImport: boolean;
    canChangeDataSource: boolean;
    importSummary: ImportSummary;
}

const FORMAT_OPTIONS: { value: SourceFormat; label: string }[] = [
    { value: 'amazon', label: 'Amazon (Weekly Gross blocks)' },
    { value: 'zeegot_po', label: 'Zeegot PO (Rate / Miles / Load# triplets)' },
];

const fmtInt = (n: number) => n.toLocaleString('en-US');

export function ImportsTab({
    slug,
    dataSource,
    canImport,
    canChangeDataSource,
    importSummary,
}: ImportsTabProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [format, setFormat] = useState<SourceFormat>('amazon');
    const [year, setYear] = useState<number>(new Date().getFullYear());
    const [filename, setFilename] = useState<string | null>(null);
    const [parseResult, setParseResult] = useState<ParseResult | null>(null);
    const [parseError, setParseError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [imports, setImports] = useState<ImportRecord[]>([]);
    const [importsLoaded, setImportsLoaded] = useState(false);

    const xlsxBacked = dataSource === 'xlsx';

    const refreshImports = useCallback(async () => {
        try {
            const res = await fetch(listImports.url(slug), {
                headers: { Accept: 'application/json' },
                credentials: 'same-origin',
            });
            if (!res.ok) return;
            const json = (await res.json()) as { imports: ImportRecord[] };
            setImports(json.imports);
            setImportsLoaded(true);
        } catch {
            // Network blips are fine — the next poll will retry.
        }
    }, [slug]);

    // Read the latest `imports` from inside the interval without re-running
    // the effect every time the list changes — otherwise the fetch updates
    // state, the effect re-runs, fires another fetch, and the loop hammers
    // the server (and pegs the UI).
    const importsRef = useRef(imports);
    importsRef.current = imports;

    useEffect(() => {
        if (!xlsxBacked) return;
        refreshImports();
        const interval = window.setInterval(() => {
            const pending = importsRef.current.some(
                (i) => i.status === 'queued' || i.status === 'processing',
            );
            if (pending) refreshImports();
        }, 2_500);
        return () => window.clearInterval(interval);
    }, [xlsxBacked, refreshImports]);

    function handleSwitchDataSource(next: 'analytics_db' | 'xlsx') {
        if (next === dataSource) return;
        router[updateDataSource(slug).method](
            updateDataSource.url(slug),
            { data_source: next },
            { preserveScroll: true },
        );
    }

    async function handleFile(file: File) {
        setParseError(null);
        setParseResult(null);
        setFilename(file.name);
        try {
            const buf = await file.arrayBuffer();
            const wb = XLSX.read(buf, { type: 'array' });
            const result =
                format === 'amazon'
                    ? parseAmazonWorkbook(wb, { year, filename: file.name })
                    : parseZeegotPoWorkbook(wb, { year, filename: file.name });
            setParseResult(result);
        } catch (e) {
            setParseError(e instanceof Error ? e.message : String(e));
        }
    }

    function handleSubmit() {
        if (!parseResult || submitting) return;
        setSubmitting(true);
        const payload: ImportPayload = parseResult.payload;
        // Inertia accepts JSON-serialisable shapes at runtime; its TS typing
        // is conservative for nested arrays of objects, hence the cast.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router[storeXlsx(slug).method](storeXlsx.url(slug), payload as any, {
            preserveScroll: true,
            onFinish: () => setSubmitting(false),
            onSuccess: () => {
                setParseResult(null);
                setFilename(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
                // Pull the freshly-queued import straight away — saves
                // waiting 2.5 s for the next interval to surface it.
                refreshImports();
            },
        });
    }

    const totalRows = useMemo(
        () => parseResult?.payload.sheets.reduce((sum, s) => sum + s.rows.length, 0) ?? 0,
        [parseResult],
    );

    return (
        <div className="flex flex-col gap-6">
            {/* Data source banner */}
            <div className="rounded-lg border bg-card p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-sm font-semibold">Data source</p>
                        <p className="text-xs text-muted-foreground">
                            {xlsxBacked
                                ? 'This team is XLSX-backed. The analytics dashboard reads from rows imported here.'
                                : 'This team reads from the analytics database. Switch to XLSX to upload weekly sheets instead.'}
                        </p>
                    </div>
                    {canChangeDataSource ? (
                        <Select
                            value={dataSource}
                            onValueChange={(v) => handleSwitchDataSource(v as 'analytics_db' | 'xlsx')}
                        >
                            <SelectTrigger className="h-8 w-48">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="analytics_db">Analytics database</SelectItem>
                                <SelectItem value="xlsx">XLSX upload</SelectItem>
                            </SelectContent>
                        </Select>
                    ) : (
                        <span className="rounded-md border bg-muted/30 px-2.5 py-1 text-xs font-medium">
                            {xlsxBacked ? 'XLSX upload' : 'Analytics database'}
                        </span>
                    )}
                </div>
            </div>

            {!xlsxBacked && (
                <div className="rounded-lg border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
                    Switch the data source to <strong>XLSX upload</strong> to enable imports.
                </div>
            )}

            {xlsxBacked && (
                <>
                    {/* Import summary */}
                    {importSummary.total_rows > 0 && (
                        <div className="rounded-lg border bg-card p-4">
                            <p className="mb-2 text-sm font-semibold">Current data</p>
                            <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                                <Stat label="Rows" value={fmtInt(importSummary.total_rows)} />
                                <Stat label="Earliest" value={importSummary.min_date ?? '—'} />
                                <Stat label="Latest" value={importSummary.max_date ?? '—'} />
                                <Stat
                                    label="Last upload"
                                    value={importSummary.last_imported_at ?? '—'}
                                    sub={importSummary.last_filename ?? undefined}
                                />
                            </div>
                        </div>
                    )}

                    {/* Recent imports — status reflects the worker, not the request. */}
                    {(imports.length > 0 || importsLoaded) && (
                        <div className="rounded-lg border bg-card p-4">
                            <div className="mb-2 flex items-center justify-between">
                                <p className="text-sm font-semibold">Recent imports</p>
                                <button
                                    type="button"
                                    onClick={refreshImports}
                                    className="text-xs font-medium text-primary hover:underline"
                                >
                                    Refresh
                                </button>
                            </div>
                            {imports.length === 0 ? (
                                <p className="rounded-md border bg-muted/20 px-3 py-6 text-center text-xs text-muted-foreground">
                                    No imports yet for this team.
                                </p>
                            ) : (
                                <div className="overflow-x-auto rounded-md border">
                                    <table className="w-full text-xs">
                                        <thead className="bg-muted/40 text-left">
                                            <tr>
                                                <th className="px-2 py-1.5">When</th>
                                                <th className="px-2 py-1.5">Status</th>
                                                <th className="px-2 py-1.5">Format</th>
                                                <th className="px-2 py-1.5">File</th>
                                                <th className="px-2 py-1.5 text-right">Sheets</th>
                                                <th className="px-2 py-1.5 text-right">Rows</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {imports.map((row) => (
                                                <ImportRow key={row.id} row={row} />
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Upload form */}
                    {canImport ? (
                        <div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
                            <p className="text-sm font-semibold">Upload a workbook</p>

                            <div className="grid gap-3 sm:grid-cols-3">
                                <div className="flex flex-col gap-1 sm:col-span-2">
                                    <Label htmlFor="imp-format">Source format</Label>
                                    <Select
                                        value={format}
                                        onValueChange={(v) => {
                                            setFormat(v as SourceFormat);
                                            setParseResult(null);
                                            setParseError(null);
                                        }}
                                    >
                                        <SelectTrigger id="imp-format">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {FORMAT_OPTIONS.map((opt) => (
                                                <SelectItem key={opt.value} value={opt.value}>
                                                    {opt.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <Label htmlFor="imp-year">
                                        Year
                                        <span className="ml-1 font-normal text-muted-foreground">
                                            (Amazon only)
                                        </span>
                                    </Label>
                                    <Input
                                        id="imp-year"
                                        type="number"
                                        min={2000}
                                        max={2099}
                                        value={year}
                                        onChange={(e) =>
                                            setYear(parseInt(e.target.value || '0') || new Date().getFullYear())
                                        }
                                    />
                                </div>
                            </div>

                            <div className="flex flex-col gap-1">
                                <Label htmlFor="imp-file">XLSX file</Label>
                                <Input
                                    ref={fileInputRef}
                                    id="imp-file"
                                    type="file"
                                    accept=".xlsx,.xls"
                                    onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (f) handleFile(f);
                                    }}
                                />
                                {filename && <p className="text-xs text-muted-foreground">Selected: {filename}</p>}
                            </div>

                            {parseError && (
                                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                                    {parseError}
                                </div>
                            )}

                            {parseResult && (
                                <div className="rounded-md border bg-muted/20 p-3">
                                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                        <p className="text-sm font-semibold">
                                            Preview: {fmtInt(totalRows)} row{totalRows === 1 ? '' : 's'} across{' '}
                                            {parseResult.payload.sheets.length} sheet
                                            {parseResult.payload.sheets.length === 1 ? '' : 's'}
                                        </p>
                                        {parseResult.warnings.length > 0 && (
                                            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600">
                                                {parseResult.warnings.length} warning
                                                {parseResult.warnings.length === 1 ? '' : 's'}
                                            </span>
                                        )}
                                    </div>

                                    <div className="max-h-64 overflow-y-auto rounded border bg-background text-xs">
                                        <table className="w-full">
                                            <thead className="sticky top-0 bg-muted/40 text-left">
                                                <tr>
                                                    <th className="px-2 py-1">Sheet</th>
                                                    <th className="px-2 py-1">Week</th>
                                                    <th className="px-2 py-1 text-right">Rows</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {parseResult.payload.sheets.map((s) => (
                                                    <tr key={s.source_sheet} className="border-t">
                                                        <td className="px-2 py-1 font-medium">{s.source_sheet}</td>
                                                        <td className="px-2 py-1 tabular-nums text-muted-foreground">
                                                            {s.week_start} → {s.week_end}
                                                        </td>
                                                        <td className="px-2 py-1 text-right tabular-nums">
                                                            {fmtInt(s.rows.length)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {parseResult.warnings.length > 0 && (
                                        <ul className="mt-2 space-y-0.5 text-xs text-amber-600">
                                            {parseResult.warnings.map((w, i) => (
                                                <li key={i}>
                                                    <strong>{w.sheet}:</strong> {w.message}
                                                </li>
                                            ))}
                                        </ul>
                                    )}

                                    <p className="mt-3 text-xs text-muted-foreground">
                                        Re-importing replaces every existing row that falls inside the same week
                                        range, so this upload is safe to repeat.
                                    </p>
                                </div>
                            )}

                            <div className="flex justify-end">
                                <Button
                                    onClick={handleSubmit}
                                    disabled={!parseResult || submitting || totalRows === 0}
                                >
                                    {submitting ? 'Importing…' : `Import ${fmtInt(totalRows)} row${totalRows === 1 ? '' : 's'}`}
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="rounded-lg border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
                            Only team admins can upload XLSX data.
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
        <div className="rounded-md border bg-muted/20 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="text-sm font-semibold tabular-nums">{value}</p>
            {sub && <p className="truncate text-[10px] text-muted-foreground">{sub}</p>}
        </div>
    );
}

const STATUS_LABELS: Record<ImportStatus, string> = {
    queued: 'Queued',
    processing: 'Processing',
    completed: 'Completed',
    failed: 'Failed',
};

const STATUS_CLASSES: Record<ImportStatus, string> = {
    queued: 'bg-muted text-muted-foreground',
    processing: 'bg-sky-500/15 text-sky-600',
    completed: 'bg-emerald-500/15 text-emerald-600',
    failed: 'bg-red-500/15 text-red-600',
};

function ImportRow({ row }: { row: ImportRecord }) {
    const when = row.created_at ? new Date(row.created_at).toLocaleString() : '—';
    return (
        <tr className="border-t">
            <td className="px-2 py-1.5 whitespace-nowrap tabular-nums text-muted-foreground">{when}</td>
            <td className="px-2 py-1.5">
                <span
                    className={
                        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ' +
                        STATUS_CLASSES[row.status]
                    }
                >
                    {STATUS_LABELS[row.status]}
                </span>
                {row.status === 'failed' && row.error_message && (
                    <p className="mt-1 max-w-xs truncate text-[10px] text-red-600" title={row.error_message}>
                        {row.error_message}
                    </p>
                )}
            </td>
            <td className="px-2 py-1.5">{row.source_format}</td>
            <td className="max-w-[16ch] truncate px-2 py-1.5 text-muted-foreground" title={row.source_filename ?? ''}>
                {row.source_filename ?? '—'}
            </td>
            <td className="px-2 py-1.5 text-right tabular-nums">{row.total_sheets}</td>
            <td className="px-2 py-1.5 text-right tabular-nums">{row.total_rows.toLocaleString('en-US')}</td>
        </tr>
    );
}
