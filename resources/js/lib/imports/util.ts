// Helpers shared by both XLSX parsers.

/**
 * Convert an Excel date serial number (days since 1899-12-30) into an ISO
 * yyyy-MM-dd string. Returns null for non-numeric input.
 */
export function excelSerialToIso(serial: number | null | undefined): string | null {
    if (typeof serial !== 'number' || !Number.isFinite(serial)) return null;
    // Excel anchor: 1899-12-30 (compensates for the 1900 leap-year bug).
    const ms = Math.round((serial - 25569) * 86_400 * 1000);
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

/** Format a Date as yyyy-MM-dd (UTC). */
export function dateToIso(d: Date): string {
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

/** Add N days (UTC) to an ISO date string. */
export function addDaysIso(iso: string, days: number): string {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return dateToIso(d);
}

/**
 * Coerce a sheet cell to a finite number, or null otherwise. Strings that
 * happen to parse cleanly as numbers (`"3700"`) count; mixed-text strings
 * (`"HOME"`, `"Transit"`) do not.
 */
export function toNumber(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
        const trimmed = v.trim();
        if (!trimmed) return null;
        const n = Number(trimmed);
        if (Number.isFinite(n) && trimmed.match(/^-?\d+(\.\d+)?$/)) return n;
    }
    return null;
}

/** Coerce a cell to a non-empty trimmed string, or null. */
export function toText(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s === '' ? null : s;
}

/**
 * Extract the trailing token of a driver name that looks like a truck label
 * (alphanumeric, mixing letters and digits — e.g. "GL1263").
 * Returns the truck token and the remaining driver name.
 */
export function splitDriverAndTruck(raw: string): { name: string; truck: string | null } {
    const trimmed = raw.trim().replace(/\s+/g, ' ');
    const match = trimmed.match(/^(.*?)\s+([A-Z]+\s*\d+)$/i);
    if (match) {
        return {
            name: match[1].trim(),
            truck: match[2].replace(/\s+/g, '').toUpperCase(),
        };
    }
    return { name: trimmed, truck: null };
}

/**
 * Parse a "MMDD-MMDD" or "(MMDD-MMDD)" substring inside a sheet name into a
 * pair of ISO dates, given a fallback year. Returns null if no range found.
 */
export function parseMmddRangeFromSheet(
    sheetName: string,
    fallbackYear: number,
): { start: string; end: string } | null {
    const match = sheetName.match(/(\d{2})(\d{2})\s*[-–]\s*(\d{2})(\d{2})/);
    if (!match) return null;
    const [, m1, d1, m2, d2] = match;
    const start = `${fallbackYear}-${m1}-${d1}`;
    let endYear = fallbackYear;
    // Handle year rollover: end month before start month → next calendar year.
    if (parseInt(m2, 10) < parseInt(m1, 10)) endYear++;
    const end = `${endYear}-${m2}-${d2}`;
    return { start, end };
}
