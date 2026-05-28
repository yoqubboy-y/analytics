<?php

namespace App\Http\Controllers\Teams;

use App\Enums\TeamRole;
use App\Http\Controllers\Controller;
use App\Models\Team;
use App\Models\TeamInvitation;
use App\Models\User;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class AdministrationController extends Controller
{
    /**
     * List the teams the current user can administer.
     */
    public function index(Request $request): Response
    {
        $user = $request->user();

        $teams = $user->teams()
            ->withCount('memberships')
            ->get()
            ->filter(fn (Team $team) => ! $team->is_personal && $user->teamRole($team)?->isAtLeast(TeamRole::Admin))
            ->map(fn (Team $team) => [
                'id' => $team->id,
                'name' => $team->name,
                'slug' => $team->slug,
                'is_personal' => $team->is_personal,
                'role' => $user->teamRole($team)?->value,
                'role_label' => $user->teamRole($team)?->label(),
                'members_count' => $team->memberships_count,
            ])
            ->values();

        return Inertia::render('administration/index', [
            'teams' => $teams,
        ]);
    }

    /**
     * Show a single team's management page (members + invitations).
     */
    public function show(Request $request, Team $team): Response
    {
        $user = $request->user();

        abort_unless($user->teamRole($team)?->isAtLeast(TeamRole::Admin), 403);

        return Inertia::render('administration/team', [
            'team' => [
                'id' => $team->id,
                'name' => $team->name,
                'slug' => $team->slug,
                'isPersonal' => $team->is_personal,
                'dataSource' => $team->data_source->value,
                'externalCompanyId' => $team->external_company_id,
            ],
            'members' => $team->members()->get()->map(fn (User $member) => [
                'id' => $member->id,
                'name' => $member->name,
                'email' => $member->email,
                'avatar' => $member->avatar ?? null,
                'role' => $member->pivot->role->value,
                'role_label' => $member->pivot->role->label(),
                'last_active_at' => $member->last_active_at?->toISOString(),
            ])->values(),
            'invitations' => $team->invitations()
                ->whereNull('accepted_at')
                ->latest()
                ->get()
                ->map(fn (TeamInvitation $invitation) => [
                    'code' => $invitation->code,
                    'email' => $invitation->email,
                    'role' => $invitation->role->value,
                    'role_label' => $invitation->role->label(),
                    'created_at' => $invitation->created_at->toISOString(),
                    'expires_at' => $invitation->expires_at?->toISOString(),
                ])->values(),
            'permissions' => $user->toTeamPermissions($team),
            'availableRoles' => TeamRole::assignable(),
        ]);
    }
}
