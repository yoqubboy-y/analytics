import {
    DownloadIcon,
    FileSpreadsheetIcon,
    FileTextIcon,
    FileTypeIcon,
    SheetIcon
    
} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';
import { UiPreview } from '@/components/ai/ui-preview';
import {
    Artifact,
    ArtifactAction,
    ArtifactActions,
    ArtifactClose,
    ArtifactContent,
    ArtifactHeader,
    ArtifactTitle,
} from '@/components/ai-elements/artifact';
import { MessageResponse } from '@/components/ai-elements/message';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    DOCUMENT_FORMATS,
    SPREADSHEET_FORMATS,
    downloadDocument,
    downloadSpreadsheet
    
    
    
} from '@/lib/exporters';
import type {Cell, DocumentFormat, SpreadsheetFormat} from '@/lib/exporters';

export type ArtifactData =
    | {
          kind: 'table';
          title: string;
          filename?: string;
          columns: string[];
          rows: Cell[][];
          formats?: SpreadsheetFormat[];
      }
    | {
          kind: 'report';
          title: string;
          filename?: string;
          markdown: string;
          formats?: DocumentFormat[];
      }
    | { kind: 'ui'; title: string; jsx: string };

const FORMAT_META: Record<
    SpreadsheetFormat | DocumentFormat,
    { label: string; icon: LucideIcon }
> = {
    xlsx: { label: 'Excel', icon: FileSpreadsheetIcon },
    csv: { label: 'CSV', icon: SheetIcon },
    pdf: { label: 'PDF', icon: FileTextIcon },
    docx: { label: 'Word', icon: FileTypeIcon },
};

function spreadsheetFormats(formats?: SpreadsheetFormat[]): SpreadsheetFormat[] {
    const requested =
        Array.isArray(formats) && formats.length > 0
            ? formats
            : SPREADSHEET_FORMATS;

    return requested.filter((format) => SPREADSHEET_FORMATS.includes(format));
}

function documentFormats(formats?: DocumentFormat[]): DocumentFormat[] {
    const requested =
        Array.isArray(formats) && formats.length > 0 ? formats : DOCUMENT_FORMATS;

    return requested.filter((format) => DOCUMENT_FORMATS.includes(format));
}

function cardSubtitle(data: ArtifactData): string {
    if (data.kind === 'table') {
        const formats = spreadsheetFormats(data.formats)
            .map((format) => FORMAT_META[format].label)
            .join(', ');

        return `${data.rows.length} row${data.rows.length === 1 ? '' : 's'} · ${formats}`;
    }

    if (data.kind === 'report') {
        return `Report · ${documentFormats(data.formats)
            .map((format) => FORMAT_META[format].label)
            .join(', ')}`;
    }

    return 'Open to view';
}

/** Compact card shown inline in a message; opens the full artifact panel. */
export function ArtifactCard({
    data,
    onOpen,
}: {
    data: ArtifactData;
    onOpen: () => void;
}) {
    const Icon =
        data.kind === 'table'
            ? FileSpreadsheetIcon
            : data.kind === 'report'
              ? FileTextIcon
              : FileTypeIcon;

    return (
        <button
            type="button"
            onClick={onOpen}
            className="not-prose my-2 flex w-full items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent"
        >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                <Icon className="size-4 text-muted-foreground" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                    {data.title}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                    {cardSubtitle(data)}
                </span>
            </span>
            <DownloadIcon className="size-4 shrink-0 text-muted-foreground" />
        </button>
    );
}

function DownloadActions({ data }: { data: ArtifactData }) {
    if (data.kind === 'table') {
        return spreadsheetFormats(data.formats).map((format) => (
            <ArtifactAction
                key={format}
                icon={FORMAT_META[format].icon}
                tooltip={`Download ${FORMAT_META[format].label}`}
                label={`Download ${FORMAT_META[format].label}`}
                onClick={() =>
                    downloadSpreadsheet(format, {
                        title: data.title,
                        filename: data.filename,
                        columns: data.columns,
                        rows: data.rows,
                    })
                }
            />
        ));
    }

    if (data.kind === 'report') {
        return documentFormats(data.formats).map((format) => (
            <ArtifactAction
                key={format}
                icon={FORMAT_META[format].icon}
                tooltip={`Download ${FORMAT_META[format].label}`}
                label={`Download ${FORMAT_META[format].label}`}
                onClick={() =>
                    void downloadDocument(format, {
                        title: data.title,
                        filename: data.filename,
                        markdown: data.markdown,
                    })
                }
            />
        ));
    }

    return null;
}

/** Full-height overlay rendering the artifact's content + actions. */
export function ArtifactPanel({
    data,
    onClose,
}: {
    data: ArtifactData;
    onClose: () => void;
}) {
    return (
        <div className="absolute inset-0 z-20 bg-background">
            <Artifact className="h-full rounded-none border-0 shadow-none">
                <ArtifactHeader>
                    <ArtifactTitle className="truncate">
                        {data.title}
                    </ArtifactTitle>
                    <ArtifactActions>
                        <DownloadActions data={data} />
                        <ArtifactClose onClick={onClose} />
                    </ArtifactActions>
                </ArtifactHeader>
                <ArtifactContent>
                    {data.kind === 'table' && (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        {data.columns.map((column, index) => (
                                            <TableHead key={index}>
                                                {column}
                                            </TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.rows.map((row, rowIndex) => (
                                        <TableRow key={rowIndex}>
                                            {row.map((cell, cellIndex) => (
                                                <TableCell key={cellIndex}>
                                                    {cell === null ||
                                                    cell === undefined
                                                        ? ''
                                                        : String(cell)}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                    {data.kind === 'report' && (
                        <MessageResponse>{data.markdown}</MessageResponse>
                    )}
                    {data.kind === 'ui' && <UiPreview jsx={data.jsx} />}
                </ArtifactContent>
            </Artifact>
        </div>
    );
}
