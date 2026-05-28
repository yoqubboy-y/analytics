// Shared shapes for client-side XLSX parsers. The server validates against
// the same shape in App\Http\Controllers\Analytics\ImportController.

export type ImportRow = {
    work_date: string; // ISO yyyy-MM-dd
    driver_name: string;
    truck_number: string | null;
    dispatcher: string | null;
    load_id: string | null;
    gross: number;
    miles: number;
    status: string | null;
};

export type ImportSheet = {
    source_sheet: string;
    week_start: string; // ISO yyyy-MM-dd
    week_end: string;
    rows: ImportRow[];
};

export type ImportPayload = {
    source_format: 'amazon' | 'zeegot_po';
    source_filename: string | null;
    sheets: ImportSheet[];
};

export type ParseWarning = {
    sheet: string;
    message: string;
};

export type ParseResult = {
    payload: ImportPayload;
    warnings: ParseWarning[];
};
