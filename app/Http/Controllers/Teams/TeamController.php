<?php

namespace App\Http\Controllers\Teams;

use App\Actions\Teams\CreateTeam;
use App\Enums\TeamDataSource;
use App\Http\Controllers\Controller;
use App\Http\Requests\Teams\DeleteTeamRequest;
use App\Http\Requests\Teams\SaveTeamRequest;
use App\Models\Team;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;

class TeamController extends Controller
{
    /**
     * Store a newly created team and open its management page.
     */
    public function store(SaveTeamRequest $request, CreateTeam $createTeam): RedirectResponse
    {
        $dataSource = TeamDataSource::from($request->validated('data_source') ?? TeamDataSource::AnalyticsDb->value);
        $externalCompanyId = $dataSource === TeamDataSource::AnalyticsDb
            ? (int) $request->validated('external_company_id')
            : null;

        $team = $createTeam->handle(
            $request->user(),
            $request->validated('name'),
            false,
            $dataSource,
            $externalCompanyId,
        );

        Inertia::flash('toast', ['type' => 'success', 'message' => __('Team created.')]);

        return to_route('administration.teams.show', ['team' => $team->slug]);
    }

    /**
     * Update the specified team.
     */
    public function update(SaveTeamRequest $request, Team $team): RedirectResponse
    {
        Gate::authorize('update', $team);

        DB::transaction(function () use ($request, $team) {
            $team = Team::whereKey($team->id)->lockForUpdate()->firstOrFail();

            $payload = ['name' => $request->validated('name')];

            // The data-source / external-company-id pair is optional on
            // update — only touch it when the form actually posts the keys,
            // so a name-only edit doesn't clobber an existing config.
            if ($request->has('data_source')) {
                $dataSource = TeamDataSource::from($request->validated('data_source'));
                $payload['data_source'] = $dataSource;
                $payload['external_company_id'] = $dataSource === TeamDataSource::AnalyticsDb
                    ? (int) $request->validated('external_company_id')
                    : null;
            } elseif ($request->has('external_company_id')) {
                $payload['external_company_id'] = (int) $request->validated('external_company_id');
            }

            $team->update($payload);
        });

        Inertia::flash('toast', ['type' => 'success', 'message' => __('Team updated.')]);

        return back();
    }

    /**
     * Switch the user's current team.
     */
    public function switch(Request $request, Team $team): RedirectResponse
    {
        abort_unless($request->user()->belongsToTeam($team), 403);

        $request->user()->switchTeam($team);

        return back();
    }

    /**
     * Delete the specified team.
     */
    public function destroy(DeleteTeamRequest $request, Team $team): RedirectResponse
    {
        $user = $request->user();
        $fallbackTeam = $user->isCurrentTeam($team)
            ? $user->fallbackTeam($team)
            : null;

        DB::transaction(function () use ($user, $team) {
            User::where('current_team_id', $team->id)
                ->where('id', '!=', $user->id)
                ->each(fn (User $affectedUser) => $affectedUser->switchTeam($affectedUser->personalTeam()));

            $team->invitations()->delete();
            $team->memberships()->delete();
            $team->delete();
        });

        if ($fallbackTeam) {
            $user->switchTeam($fallbackTeam);
        }

        Inertia::flash('toast', ['type' => 'success', 'message' => __('Team deleted.')]);

        return to_route('administration.index');
    }
}
