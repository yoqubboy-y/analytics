<?php

use App\Enums\TeamRole;
use App\Models\Team;
use App\Models\TeamInvitation;
use App\Models\User;
use App\Notifications\Teams\TeamInvitation as TeamInvitationNotification;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Inertia\Testing\AssertableInertia as Assert;

test('administration index lists only non-personal teams the user can administer', function () {
    $user = User::factory()->create(); // also owns a personal team

    $owned = Team::factory()->create(['name' => 'Owned Co']);
    $owned->members()->attach($user, ['role' => TeamRole::Owner->value]);

    $memberTeam = Team::factory()->create(['name' => 'Member Co']);
    $memberTeam->members()->attach($user, ['role' => TeamRole::Member->value]);

    $this
        ->actingAs($user)
        ->get(route('administration.index'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('administration/index')
            ->has('teams', 1)
            ->where('teams.0.name', 'Owned Co')
        );
});

test('an admin can view a team management page', function () {
    $user = User::factory()->create();
    $team = Team::factory()->create();
    $team->members()->attach($user, ['role' => TeamRole::Admin->value]);

    $this
        ->actingAs($user)
        ->get(route('administration.teams.show', $team))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('administration/team'));
});

test('a member cannot view a team management page', function () {
    $user = User::factory()->create();
    $team = Team::factory()->create();
    $team->members()->attach($user, ['role' => TeamRole::Member->value]);

    $this
        ->actingAs($user)
        ->get(route('administration.teams.show', $team))
        ->assertForbidden();
});

test('a non-member cannot view a team management page', function () {
    $user = User::factory()->create();
    $team = Team::factory()->create();

    $this
        ->actingAs($user)
        ->get(route('administration.teams.show', $team))
        ->assertForbidden();
});

test('an admin can resend an invitation', function () {
    Notification::fake();

    $admin = User::factory()->create();
    $team = Team::factory()->create();
    $team->members()->attach($admin, ['role' => TeamRole::Admin->value]);

    $invitation = TeamInvitation::factory()->for($team)->create([
        'expires_at' => now()->addDay(),
    ]);

    $this
        ->actingAs($admin)
        ->post(route('teams.invitations.resend', [$team, $invitation]))
        ->assertRedirect();

    Notification::assertSentOnDemand(TeamInvitationNotification::class);
});

test('a regular member cannot resend an invitation', function () {
    $member = User::factory()->create();
    $team = Team::factory()->create();
    $team->members()->attach($member, ['role' => TeamRole::Member->value]);

    $invitation = TeamInvitation::factory()->for($team)->create();

    $this
        ->actingAs($member)
        ->post(route('teams.invitations.resend', [$team, $invitation]))
        ->assertForbidden();
});

test('an authenticated request records last activity', function () {
    $user = User::factory()->create(['last_active_at' => null]);

    expect($user->last_active_at)->toBeNull();

    $this->actingAs($user)->get(route('administration.index'))->assertOk();

    expect($user->fresh()->last_active_at)->not->toBeNull();
});

test('an admin can create a user directly', function () {
    $admin = User::factory()->create();
    $team = Team::factory()->create();
    $team->members()->attach($admin, ['role' => TeamRole::Admin->value]);

    $this
        ->actingAs($admin)
        ->post(route('teams.members.store', $team), [
            'name' => 'New User',
            'email' => 'new@example.com',
            'role' => TeamRole::Member->value,
            'password' => 'password',
            'password_confirmation' => 'password',
        ])
        ->assertRedirect();

    $user = User::where('email', 'new@example.com')->firstOrFail();

    expect($user->name)->toBe('New User')
        ->and($user->hasVerifiedEmail())->toBeTrue()
        ->and($user->belongsToTeam($team))->toBeTrue()
        ->and($user->current_team_id)->toBe($team->id)
        ->and(Hash::check('password', $user->password))->toBeTrue()
        ->and($team->members()->whereKey($user->id)->first()->pivot->role)->toBe(TeamRole::Member);
});

test('creating a user with an existing email adds them to the team', function () {
    $admin = User::factory()->create();
    $team = Team::factory()->create();
    $team->members()->attach($admin, ['role' => TeamRole::Admin->value]);

    $existing = User::factory()->create(['email' => 'existing@example.com']);
    $originalPassword = $existing->password;

    $this
        ->actingAs($admin)
        ->post(route('teams.members.store', $team), [
            'name' => 'Ignored',
            'email' => 'existing@example.com',
            'role' => TeamRole::Viewer->value,
            'password' => 'password',
            'password_confirmation' => 'password',
        ])
        ->assertRedirect();

    expect($existing->fresh()->belongsToTeam($team))->toBeTrue()
        ->and($existing->fresh()->password)->toBe($originalPassword)
        ->and(User::where('email', 'existing@example.com')->count())->toBe(1);
});

test('creating a user who is already a member is rejected', function () {
    $admin = User::factory()->create();
    $team = Team::factory()->create();
    $team->members()->attach($admin, ['role' => TeamRole::Admin->value]);

    $member = User::factory()->create(['email' => 'member@example.com']);
    $team->members()->attach($member, ['role' => TeamRole::Member->value]);

    $this
        ->actingAs($admin)
        ->post(route('teams.members.store', $team), [
            'name' => 'X',
            'email' => 'member@example.com',
            'role' => TeamRole::Member->value,
            'password' => 'password',
            'password_confirmation' => 'password',
        ])
        ->assertSessionHasErrors('email');
});

test('a regular member cannot create users', function () {
    $member = User::factory()->create();
    $team = Team::factory()->create();
    $team->members()->attach($member, ['role' => TeamRole::Member->value]);

    $this
        ->actingAs($member)
        ->post(route('teams.members.store', $team), [
            'name' => 'X',
            'email' => 'x@example.com',
            'role' => TeamRole::Member->value,
            'password' => 'password',
            'password_confirmation' => 'password',
        ])
        ->assertForbidden();
});
