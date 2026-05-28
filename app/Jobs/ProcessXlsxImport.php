<?php

namespace App\Jobs;

use App\Models\XlsxDriverDay;
use App\Models\XlsxImport;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * Apply a staged XLSX upload to `xlsx_driver_days`. Runs in the background
 * because Amazon weeks can hit ~10 k rows and Zeegot PO ~150 rows × many
 * weeks — both expensive enough to block a web request.
 *
 * Idempotent within a single attempt: every sheet's date range is deleted
 * before the new rows are inserted, so a retry resumes cleanly.
 */
class ProcessXlsxImport implements ShouldQueue
{
    use Queueable;

    /**
     * Try a handful of times before giving up; SQLite can occasionally trip
     * "database is locked" under contention.
     */
    public int $tries = 3;

    public int $timeout = 600;

    public function __construct(public int $importId) {}

    public function handle(): void
    {
        /** @var XlsxImport|null $import */
        $import = XlsxImport::query()->find($this->importId);

        if (! $import) {
            // The import row was removed before processing — nothing to do.
            return;
        }

        if ($import->status === XlsxImport::STATUS_COMPLETED) {
            return;
        }

        if (! $import->payload_path || ! Storage::disk('local')->exists($import->payload_path)) {
            $this->markFailed($import, 'Staged payload was not found on disk.');

            return;
        }

        $import->update([
            'status' => XlsxImport::STATUS_PROCESSING,
            'started_at' => now(),
            'error_message' => null,
        ]);

        try {
            $raw = Storage::disk('local')->get($import->payload_path);
            /** @var array{
             *     source_format: string,
             *     source_filename: ?string,
             *     sheets: array<int, array{
             *         source_sheet: ?string,
             *         week_start: string,
             *         week_end: string,
             *         rows: array<int, array<string, mixed>>,
             *     }>,
             * } $payload
             */
            $payload = json_decode($raw, true, flags: JSON_THROW_ON_ERROR);

            $totalRows = 0;

            DB::transaction(function () use ($import, $payload, &$totalRows) {
                $now = now();

                foreach ($payload['sheets'] as $sheet) {
                    XlsxDriverDay::query()
                        ->where('team_id', $import->team_id)
                        ->whereBetween('work_date', [$sheet['week_start'], $sheet['week_end']])
                        ->delete();

                    $payloadRows = [];
                    foreach ($sheet['rows'] as $row) {
                        $payloadRows[] = [
                            'team_id' => $import->team_id,
                            'work_date' => $row['work_date'],
                            'driver_name' => $row['driver_name'],
                            'truck_number' => $row['truck_number'] ?? null,
                            'dispatcher' => $row['dispatcher'] ?? null,
                            'load_id' => $row['load_id'] ?? null,
                            'gross' => (float) ($row['gross'] ?? 0),
                            'miles' => (float) ($row['miles'] ?? 0),
                            'status' => $row['status'] ?? null,
                            'source_format' => $payload['source_format'],
                            'source_sheet' => $sheet['source_sheet'] ?? null,
                            'source_filename' => $payload['source_filename'] ?? null,
                            'created_at' => $now,
                            'updated_at' => $now,
                        ];
                    }

                    foreach (array_chunk($payloadRows, 500) as $chunk) {
                        XlsxDriverDay::query()->insert($chunk);
                    }

                    $totalRows += count($payloadRows);
                }
            });

            $import->update([
                'status' => XlsxImport::STATUS_COMPLETED,
                'completed_at' => now(),
                'total_rows' => $totalRows,
            ]);

            Storage::disk('local')->delete($import->payload_path);
            $import->update(['payload_path' => null]);
        } catch (Throwable $e) {
            $this->markFailed($import, $e->getMessage());

            throw $e;
        }
    }

    public function failed(Throwable $e): void
    {
        $import = XlsxImport::query()->find($this->importId);

        if ($import && $import->status !== XlsxImport::STATUS_COMPLETED) {
            $this->markFailed($import, $e->getMessage());
        }
    }

    private function markFailed(XlsxImport $import, string $message): void
    {
        $import->update([
            'status' => XlsxImport::STATUS_FAILED,
            'error_message' => mb_substr($message, 0, 1000),
            'completed_at' => now(),
        ]);
    }
}
