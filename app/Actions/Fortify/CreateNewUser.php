<?php

namespace App\Actions\Fortify;

use App\Concerns\PasswordValidationRules;
use App\Concerns\ProfileValidationRules;
use App\Models\TeamInvitation;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use Laravel\Fortify\Contracts\CreatesNewUsers;

class CreateNewUser implements CreatesNewUsers
{
    use PasswordValidationRules, ProfileValidationRules;

    /**
     * Validate and create a newly registered user.
     *
     * @param  array<string, string>  $input
     */
    public function create(array $input): User
    {
        Validator::make($input, [
            'code' => ['required', 'string'],
            ...$this->profileRules(),
            'password' => $this->passwordRules(),
        ])->validate();

        $invitation = TeamInvitation::where('code', $input['code'])
            ->where('email', $input['email'])
            ->first();

        if (! $invitation || ! $invitation->isPending()) {
            throw ValidationException::withMessages([
                'email' => __('This invitation is invalid, has expired, or was sent to a different address.'),
            ]);
        }

        return DB::transaction(function () use ($input, $invitation) {
            $user = User::create([
                'name' => $input['name'],
                'email' => $input['email'],
                'password' => $input['password'],
            ]);

            $invitation->team->memberships()->firstOrCreate(
                ['user_id' => $user->id],
                ['role' => $invitation->role],
            );

            $invitation->update(['accepted_at' => now()]);

            $user->switchTeam($invitation->team);

            return $user;
        });
    }
}
