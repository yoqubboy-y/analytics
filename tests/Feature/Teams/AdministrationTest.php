<?php

use App\Enums\TeamRole;
use App\Models\Team;
use App\Models\TeamInvitation;
use App\Models\User;
use App\Notifications\Teams\TeamInvitation as TeamInvitationNotification;
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
