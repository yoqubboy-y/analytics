<?php

use App\Models\TeamInvitation;
use App\Models\User;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Support\Facades\Notification;

test('mail is branded and sends through the resend transport', function () {
    expect(config('mail.from.address'))->toBe('no_reply@rooler.ai')
        ->and(config('mail.from.name'))->toBe('Rooler')
        ->and(config('mail.mailers.resend.transport'))->toBe('resend');
});

test('registering sends a verification email', function () {
    Notification::fake();

    $invitation = TeamInvitation::factory()->create([
        'email' => 'invited@example.com',
        'expires_at' => now()->addDays(3),
    ]);

    $this->post(route('register.store'), [
        'name' => 'Test User',
        'email' => 'invited@example.com',
        'password' => 'password',
        'password_confirmation' => 'password',
        'code' => $invitation->code,
    ]);

    Notification::assertSentTo(
        User::where('email', 'invited@example.com')->firstOrFail(),
        VerifyEmail::class,
    );
});
