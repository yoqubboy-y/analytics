<?php

use App\Models\TeamInvitation;

test('registration screen redirects to login without valid invitation', function () {
    $this->get(route('register'))->assertRedirect(route('login'));
});

test('registration screen can be rendered with valid invitation', function () {
    $invitation = TeamInvitation::factory()->create([
        'email' => 'invited@example.com',
        'expires_at' => now()->addDays(3),
    ]);

    $this->get(route('register', ['code' => $invitation->code]))->assertOk();
});

test('new users can register with a valid invitation', function () {
    $invitation = TeamInvitation::factory()->create([
        'email' => 'invited@example.com',
        'expires_at' => now()->addDays(3),
    ]);

    $response = $this->post(route('register.store'), [
        'name' => 'Test User',
        'email' => 'invited@example.com',
        'password' => 'password',
        'password_confirmation' => 'password',
        'code' => $invitation->code,
    ]);

    $this->assertAuthenticated();

    $response->assertRedirect(route('dashboard'));
    expect($invitation->fresh()->isAccepted())->toBeTrue();
});

test('registration is rejected without an invitation code', function () {
    $this->post(route('register.store'), [
        'name' => 'Test User',
        'email' => 'noone@example.com',
        'password' => 'password',
        'password_confirmation' => 'password',
    ])->assertSessionHasErrors('code');

    $this->assertGuest();
});
