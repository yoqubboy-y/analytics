<?php

namespace App\Http\Controllers\Analytics;

use App\Enums\TeamDataSource;
use App\Enums\TeamPermission;
use App\Http\Controllers\Controller;
use App\Jobs\ProcessXlsxImport;
use App\Models\Team;
use App\Models\XlsxImport;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ImportController extends Controller
{
    /**
     * Accept a parsed XLSX payload, stage it on disk, and hand it to the
     * worker. Returns immediately with the import id so the UI can poll
     * status.
     */
    public function storeXlsx(Request $request, Team $currentTeam): RedirectResponse
    {
        $user = Auth::user();

        if (! $user || ! $user->hasTeamPermission($currentTeam, TeamPermission::ImportXlsx)) {
            throw new AuthorizationException('You do not have permission to import data for this team.');
        }

        if ($currentTeam->data_source !== TeamDataSource::Xlsx) {
            throw new AuthorizationException('This team is not configured for XLSX imports.');
        }

        $data = $request->validate([
            'source_format' => ['required', 'string', 'in:amazon,zeegot_po'],
            'source_filename' => ['nullable', 'string', 'max:255'],
            'sheets' => ['required', 'array', 'min:1'],
            'sheets.*.source_sheet' => ['nullable', 'string', 'max:255'],
            'sheets.*.week_start' => ['required', 'date_format:Y-m-d'],
            'sheets.*.week_end' => ['required', 'date_format:Y-m-d', 'after_or_equal:sheets.*.week_start'],
            'sheets.*.rows' => ['required', 'array'],
            'sheets.*.rows.*.work_date' => ['required', 'date_format:Y-m-d'],
            'sheets.*.rows.*.driver_name' => ['required', 'string', 'max:255'],
            'sheets.*.rows.*.truck_number' => ['nullable', 'string', 'max:64'],
            'sheets.*.rows.*.dispatcher' => ['nullable', 'string', 'max:255'],
            'sheets.*.rows.*.load_id' => ['nullable', 'string', 'max:128'],
            'sheets.*.rows.*.gross' => ['nullable', 'numeric'],
            'sheets.*.rows.*.miles' => ['nullable', 'numeric'],
            'sheets.*.rows.*.status' => ['nullable', 'string', 'max:255'],
        ]);

        $totalRows = collect($data['sheets'])->sum(fn (array $s) => count($s['rows']));

        // Stage the parsed payload on the local disk; the worker reads it
        // back when the queued job runs. A random filename avoids races
        // between concurrent uploads.
        $payloadPath = sprintf(
            'imports/team-%d/%s-%s.json',
            $currentTeam->id,
            now()->format('Ymd-His'),
            Str::random(8),
        );
        Storage::disk('local')->put($payloadPath, json_encode($data, JSON_THROW_ON_ERROR));

        $import = XlsxImport::query()->create([
            'team_id' => $currentTeam->id,
            'user_id' => $user->id,
            'source_format' => $data['source_format'],
            'source_filename' => $data['source_filename'] ?? null,
            'total_sheets' => count($data['sheets']),
            'total_rows' => $totalRows,
            'status' => XlsxImport::STATUS_QUEUED,
            'payload_path' => $payloadPath,
        ]);

        ProcessXlsxImport::dispatch($import->id);

        return back()->with('import_result', [
            'message' => sprintf(
                'Queued import of %d row%s across %d sheet%s. Worker will pick it up.',
                $totalRows,
                $totalRows === 1 ? '' : 's',
                count($data['sheets']),
                count($data['sheets']) === 1 ? '' : 's',
            ),
            'import_id' => $import->id,
        ]);
    }

    /**
     * Return the most recent imports for this team so the UI can show
     * status without reloading the whole configuration page.
     */
    public function listImports(Team $currentTeam): JsonResponse
    {
        $user = Auth::user();

        if (! $user || ! $user->belongsToTeam($currentTeam)) {
            throw new AuthorizationException;
        }

        $imports = $currentTeam->xlsxImports()
            ->latest('id')
            ->limit(20)
            ->get()
            ->map(fn (XlsxImport $i) => [
                'id' => $i->id,
                'source_format' => $i->source_format,
                'source_filename' => $i->source_filename,
                'total_sheets' => $i->total_sheets,
                'total_rows' => $i->total_rows,
                'status' => $i->status,
                'error_message' => $i->error_message,
                'started_at' => $i->started_at?->toIso8601String(),
                'completed_at' => $i->completed_at?->toIso8601String(),
                'created_at' => $i->created_at?->toIso8601String(),
            ]);

        return response()->json(['imports' => $imports]);
    }

    /**
     * Switch a team's data source. Lets an owner/admin mark a fresh team as
     * XLSX-backed before importing.
     */
    public function updateDataSource(Request $request, Team $currentTeam): RedirectResponse
    {
        $user = Auth::user();

        if (! $user || ! $user->hasTeamPermission($currentTeam, TeamPermission::UpdateTeam)) {
            throw new AuthorizationException('You do not have permission to change the data source for this team.');
        }

        $data = $request->validate([
            'data_source' => ['required', 'string', 'in:analytics_db,xlsx'],
        ]);

        $currentTeam->update(['data_source' => $data['data_source']]);

        return back();
    }
}
