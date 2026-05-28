// Parser for the Amazon-style weekly XLSX workbook.
//
// Per sheet, each driver occupies a variable-height block:
//
//   ["Driver", "MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN", ...]   ← block header
//   [driverName, g1.mon, g1.tue, ..., null, "Gross", totalGross]       ← load-1 daily gross
//   ["Gross",   g2.mon, g2.tue, ..., null, "Miles", totalMiles]        ← load-2+ daily gross (opt)
//   ["Miles",   m1.mon, m1.tue, ..., null, "RPM",   rpm]               ← load-1 daily miles
//   [null,      m2.mon, m2.tue, ..., null, null,    null]              ← load-2+ daily miles (opt)
//   ...blank rows...
//
// Sheet names look like "Weekly Gross (0525-0531)" — MM/DD with no year, so
// the caller supplies the year.

import * as XLSX from 'xlsx';
import type { ImportRow, ImportSheet, ParseResult } from './types';
import {
    addDaysIso,
    parseMmddRangeFromSheet,
    splitDriverAndTruck,
    toNumber,
    toText,
} from './util';

type Cell = unknown;
type Sheet = Cell[][];

const DAY_OFFSETS = [0, 1, 2, 3, 4, 5, 6]; // MON..SUN

export function parseAmazonWorkbook(
    workbook: XLSX.WorkBook,
    opts: { year: number; filename?: string | null },
): ParseResult {
    const sheets: ImportSheet[] = [];
    const warnings: ParseResult['warnings'] = [];

    for (const sheetName of workbook.SheetNames) {
        const ws = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json<Cell[]>(ws, {
            header: 1,
            defval: null,
            blankrows: true,
        });

        const range = parseMmddRangeFromSheet(sheetName, opts.year);
        if (!range) {
            warnings.push({
                sheet: sheetName,
                message: `Could not infer week range from sheet name "${sheetName.trim()}".`,
            });
            continue;
        }

        const rows: ImportRow[] = [];
        let i = 0;

        while (i < data.length) {
            const row = data[i] ?? [];

            // Look for a block header row: col 0 === "Driver", col 1 === "MON".
            if (toText(row[0])?.toUpperCase() === 'DRIVER' && toText(row[1])?.toUpperCase() === 'MON') {
                i++;
                const consumed = consumeDriverBlock(data, i, range.start, rows);
                i = consumed.nextIndex;
                continue;
            }

            i++;
        }

        sheets.push({
            source_sheet: sheetName.trim(),
            week_start: range.start,
            week_end: range.end,
            rows,
        });
    }

    return {
        payload: {
            source_format: 'amazon',
            source_filename: opts.filename ?? null,
            sheets,
        },
        warnings,
    };
}

function consumeDriverBlock(
    data: Sheet,
    start: number,
    weekStart: string,
    out: ImportRow[],
): { nextIndex: number } {
    const driverRow = data[start];
    if (!driverRow) return { nextIndex: start };

    const driverNameRaw = toText(driverRow[0]);
    if (!driverNameRaw) return { nextIndex: start + 1 };

    const { name, truck } = splitDriverAndTruck(driverNameRaw);

    // Collect day-aligned gross + miles arrays. Both can span multiple rows.
    // For each weekday column we accumulate numeric values and remember the
    // first non-numeric label seen (idle marker like "home" / "Transit").
    const grossPerDay = new Array(7).fill(0) as number[];
    const milesPerDay = new Array(7).fill(0) as number[];
    const statusPerDay = new Array<string | null>(7).fill(null);

    function absorbDayCells(row: Cell[], target: number[]) {
        for (const d of DAY_OFFSETS) {
            const cell = row[1 + d];
            const n = toNumber(cell);
            if (n != null) {
                target[d] += n;
            } else {
                const txt = toText(cell);
                if (txt && statusPerDay[d] == null) {
                    statusPerDay[d] = txt;
                }
            }
        }
    }

    // Row N: driver name + load-1 gross per day.
    absorbDayCells(driverRow, grossPerDay);

    let i = start + 1;

    // Optional "Gross" continuation row (load-2+ gross).
    if (i < data.length) {
        const candidate = data[i] ?? [];
        if (toText(candidate[0])?.toUpperCase() === 'GROSS') {
            absorbDayCells(candidate, grossPerDay);
            i++;
        }
    }

    // "Miles" row (load-1 miles per day).
    if (i < data.length) {
        const candidate = data[i] ?? [];
        if (toText(candidate[0])?.toUpperCase() === 'MILES') {
            absorbDayCells(candidate, milesPerDay);
            i++;
        }
    }

    // Trailing miles continuation rows (col 0 empty, cols 1-7 have values).
    // Stop at the next driver block header, the next "Driver" / "Gross" /
    // "Miles" label, or two consecutive empty rows.
    let blanksInARow = 0;
    while (i < data.length) {
        const candidate = data[i] ?? [];
        const label = toText(candidate[0])?.toUpperCase();
        if (label === 'DRIVER' || label === 'GROSS' || label === 'MILES') break;

        const hasAnyDayCell = DAY_OFFSETS.some((d) => candidate[1 + d] != null);
        if (!hasAnyDayCell) {
            blanksInARow++;
            if (blanksInARow >= 2) break;
            i++;
            continue;
        }
        blanksInARow = 0;
        absorbDayCells(candidate, milesPerDay);
        i++;
    }

    for (const d of DAY_OFFSETS) {
        const gross = grossPerDay[d];
        const miles = milesPerDay[d];
        const status = statusPerDay[d];
        if (gross === 0 && miles === 0 && !status) continue;

        out.push({
            work_date: addDaysIso(weekStart, d),
            driver_name: name,
            truck_number: truck,
            dispatcher: null,
            load_id: null,
            gross,
            miles,
            status,
        });
    }

    return { nextIndex: i };
}
