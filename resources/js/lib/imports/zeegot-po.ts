// Parser for the Zeegot PO weekly XLSX workbook.
//
// Header row carries Excel date serials for Mon..Sun in columns 3-9. Then
// every driver occupies exactly three rows:
//
//   [name, "Rate",  truck#, mon$, tue$, ..., sun$, _, totalRate, planReach, _, _]
//   [null, "Miles", null,   mon_mi, ..., sun_mi, _, _, _, totalMiles, _]
//   [null, "Load#", null,   mon_load, ..., sun_load, _, _, _, RPM, _]
//
// Sheet names look like "0323-0329" — MM/DD only; the year is taken from the
// header-row date serials when available, with a fallback supplied by the
// caller.

import * as XLSX from 'xlsx';
import type { ImportRow, ImportSheet, ParseResult } from './types';
import { addDaysIso, excelSerialToIso, parseMmddRangeFromSheet, toNumber, toText } from './util';

type Cell = unknown;

const DAY_COLS = [3, 4, 5, 6, 7, 8, 9]; // Mon..Sun
const TRUCK_COL = 2;

export function parseZeegotPoWorkbook(
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

        // Prefer the embedded Excel date serials in the header row over the
        // sheet-name guess, since they carry the year.
        const headerRow = data[1] ?? [];
        let weekStart: string | null = excelSerialToIso(toNumber(headerRow[DAY_COLS[0]]) ?? null);
        let weekEnd: string | null = excelSerialToIso(toNumber(headerRow[DAY_COLS[6]]) ?? null);

        if (!weekStart || !weekEnd) {
            const guess = parseMmddRangeFromSheet(sheetName, opts.year);
            if (!guess) {
                warnings.push({
                    sheet: sheetName,
                    message: `Could not determine week range from sheet "${sheetName}".`,
                });
                continue;
            }
            weekStart = guess.start;
            weekEnd = guess.end;
        }

        const rows: ImportRow[] = [];
        let i = 0;
        while (i < data.length) {
            const rateRow = data[i] ?? [];
            const driverName = toText(rateRow[0]);
            const labelRate = toText(rateRow[1])?.toUpperCase();

            if (!driverName || labelRate !== 'RATE') {
                i++;
                continue;
            }

            const milesRow = data[i + 1] ?? [];
            const loadRow = data[i + 2] ?? [];
            const labelMiles = toText(milesRow[1])?.toUpperCase();
            const labelLoad = toText(loadRow[1])?.toUpperCase();

            if (labelMiles !== 'MILES' || labelLoad !== 'LOAD#') {
                // Not a real driver triplet — skip just this row.
                i++;
                continue;
            }

            const truck = toText(rateRow[TRUCK_COL]);

            for (let d = 0; d < 7; d++) {
                const col = DAY_COLS[d];
                const grossCell = rateRow[col];
                const milesCell = milesRow[col];
                const loadCell = loadRow[col];

                const gross = toNumber(grossCell) ?? 0;
                const miles = toNumber(milesCell) ?? 0;
                const loadId = toText(loadCell);
                // The rate cell often holds an idle marker ("HOME", "Transit",
                // "REST", "TRUCK ISSUE", etc.) when no revenue ran that day.
                const status = gross === 0 ? toText(grossCell) : null;

                if (gross === 0 && miles === 0 && !status && !loadId) continue;

                rows.push({
                    work_date: addDaysIso(weekStart, d),
                    driver_name: driverName,
                    truck_number: truck,
                    dispatcher: null,
                    load_id: loadId,
                    gross,
                    miles,
                    status,
                });
            }

            i += 3;
        }

        sheets.push({
            source_sheet: sheetName,
            week_start: weekStart,
            week_end: weekEnd,
            rows,
        });
    }

    return {
        payload: {
            source_format: 'zeegot_po',
            source_filename: opts.filename ?? null,
            sheets,
        },
        warnings,
    };
}
