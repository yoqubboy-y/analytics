<?php

namespace App\Http\Controllers\Teams;

use App\Concerns\PasswordValidationRules;
use App\Enums\TeamRole;
use App\Http\Controllers\Controller;
use App\Http\Requests\Teams\UpdateTeamMemberRequest;
use App\Models\Team;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;

class TeamMemberController extends Controller
{
    use PasswordValidationRules;

    /**
     * Directly add a user to the team — create a new account (admin sets the
     * password, auto-verified) or attach an existing account by email.
     */
    public function store(Request $request, Team $team): RedirectResponse
    {
        Gate::authorize('addMember', $team);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255'],
            'role' => ['required', Rule::in(array_column(TeamRole::assignable(), 'value'))],
            'password' => $this->passwordRules(),
        ]);

        $role = TeamRole::from($data['role']);
        $existing = User::where('email', $data['email'])->first();

        if ($existing) {
            if ($team->members()->whereKey($existing->id)->exists()) {
                throw ValidationException::withMessages([
                    'email' => __('This user is already a member of the team.'),
                ]);
            }

            $team->members()->attach($existing->id, ['role' => $role->value]);

            Inertia::flash('toast', ['type' => 'success', 'message' => __('User added to the team.')]);

            return back();
        }

        $user = User::create([
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => $data['password'],
        ]);

        $team->members()->attach($user->id, ['role' => $role->value]);

        // Admin-created accounts are pre-verified and land on this team.
        $user->forceFill([
            'email_verified_at' => now(),
            'current_team_id' => $team->id,
        ])->save();

        Inertia::flash('toast', ['type' => 'success', 'message' => __('User created and added to the team.')]);

        return back();
    }

    /**
     * Update the specified team member's role.
     */
    public function update(UpdateTeamMemberRequest $request, Team $team, User $user): RedirectResponse
    {
        Gate::authorize('updateMember', $team);

        $newRole = TeamRole::from($request->validated('role'));

        $team->memberships()
            ->where('user_id', $user->id)
            ->firstOrFail()
            ->update(['role' => $newRole]);

        Inertia::flash('toast', ['type' => 'success', 'message' => __('Member role updated.')]);

        return back();
    }

    /**
     * Remove the specified team member.
     */
    public function destroy(Team $team, User $user): RedirectResponse
    {
        Gate::authorize('removeMember', $team);

        abort_if($team->owner()?->is($user), 403, __('The team owner cannot be removed.'));

        $team->memberships()
            ->where('user_id', $user->id)
            ->delete();

        if ($user->isCurrentTeam($team)) {
            $user->switchTeam($user->personalTeam());
        }

        Inertia::flash('toast', ['type' => 'success', 'message' => __('Member removed.')]);

        return back();
    }
}
