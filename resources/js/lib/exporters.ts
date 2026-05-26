import type { Tokens } from 'marked';
import * as XLSX from 'xlsx';
import { downloadBlob } from '@/lib/download';

export type Cell = string | number | null | undefined;
export type SpreadsheetFormat = 'xlsx' | 'csv';
export type DocumentFormat = 'pdf' | 'docx';

export const SPREADSHEET_FORMATS: SpreadsheetFormat[] = ['xlsx', 'csv'];
export const DOCUMENT_FORMATS: DocumentFormat[] = ['pdf', 'docx'];

export type SpreadsheetPayload = {
    title?: string;
    filename?: string;
    columns: string[];
    rows: Cell[][];
};

export type DocumentPayload = {
    title: string;
    filename?: string;
    markdown: string;
};

function slugify(value: string): string {
    return (
        value
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'export'
    );
}

function cellText(value: Cell): string {
    return value === null || value === undefined ? '' : String(value);
}

/** Strip inline Markdown markers for plain-text PDF rendering. */
function stripInline(value: string): string {
    return value
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/(\*\*|__|\*|_|`)/g, '')
        .trim();
}

// ── Spreadsheets (tabular data) ─────────────────────────────────────────────

export function downloadSpreadsheet(
    format: SpreadsheetFormat,
    payload: SpreadsheetPayload,
): void {
    const base = slugify(payload.filename ?? payload.title ?? 'export');
    const aoa: Cell[][] = [payload.columns, ...payload.rows];

    if (format === 'csv') {
        const csv = aoa
            .map((row) =>
                row
                    .map((cell) => {
                        const text = cellText(cell);

                        return /[",\n]/.test(text)
                            ? `"${text.replace(/"/g, '""')}"`
                            : text;
                    })
                    .join(','),
            )
            .join('\n');

        downloadBlob(
            new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' }),
            `${base}.csv`,
        );

        return;
    }

    const worksheet = XLSX.utils.aoa_to_sheet(aoa);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        (payload.title ?? 'Export').slice(0, 31),
    );
    XLSX.writeFile(workbook, `${base}.xlsx`);
}

// ── Documents (written reports) ─────────────────────────────────────────────

export async function downloadDocument(
    format: DocumentFormat,
    payload: DocumentPayload,
): Promise<void> {
    const base = slugify(payload.filename ?? payload.title);

    if (format === 'docx') {
        await exportDocx(payload, base);

        return;
    }

    await exportPdf(payload, base);
}

async function exportDocx(payload: DocumentPayload, base: string) {
    const { marked } = await import('marked');
    const body = await marked.parse(payload.markdown, { async: false });

    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${payload.title}</title></head><body><h1>${payload.title}</h1>${body}</body></html>`;

    downloadBlob(
        new Blob(['﻿', html], { type: 'application/msword' }),
        `${base}.doc`,
    );
}

async function exportPdf(payload: DocumentPayload, base: string) {
    const [{ jsPDF }, { default: autoTable }, { marked }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
        import('marked'),
    ]);

    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const margin = 48;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const maxWidth = pageWidth - margin * 2;
    let y = margin;

    const ensureSpace = (space: number) => {
        if (y + space > pageHeight - margin) {
            doc.addPage();
            y = margin;
        }
    };

    const writeText = (
        text: string,
        size: number,
        style: 'normal' | 'bold',
        indent = 0,
        gapAfter = 6,
    ) => {
        doc.setFont('helvetica', style);
        doc.setFontSize(size);
        const lineHeight = size * 1.35;
        const lines = doc.splitTextToSize(
            stripInline(text),
            maxWidth - indent,
        ) as string[];

        for (const line of lines) {
            ensureSpace(lineHeight);
            doc.text(line, margin + indent, y);
            y += lineHeight;
        }

        y += gapAfter;
    };

    writeText(payload.title, 18, 'bold', 0, 12);

    for (const token of marked.lexer(payload.markdown)) {
        if (token.type === 'heading') {
            const size = [16, 14, 12][token.depth - 1] ?? 11;
            writeText(token.text, size, 'bold', 0, 4);
        } else if (token.type === 'paragraph') {
            writeText(token.text, 10, 'normal');
        } else if (token.type === 'list') {
            for (const item of token.items) {
                writeText(`•  ${item.text}`, 10, 'normal', 10, 2);
            }

            y += 4;
        } else if (token.type === 'table') {
            const table = token as Tokens.Table;
            ensureSpace(40);
            autoTable(doc, {
                head: [table.header.map((cell) => stripInline(cell.text))],
                body: table.rows.map((row) =>
                    row.map((cell) => stripInline(cell.text)),
                ),
                startY: y,
                margin: { left: margin, right: margin },
                styles: { fontSize: 8, cellPadding: 3 },
                headStyles: { fillColor: [37, 99, 235] },
            });
            const tabled = doc as unknown as {
                lastAutoTable?: { finalY: number };
            };
            y = (tabled.lastAutoTable?.finalY ?? y) + 14;
        } else if (token.type === 'blockquote' || token.type === 'code') {
            writeText(token.text ?? '', 9, 'normal', 10);
        }
    }

    doc.save(`${base}.pdf`);
}
