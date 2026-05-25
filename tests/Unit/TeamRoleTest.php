<?php

use App\Enums\TeamPermission;
use App\Enums\TeamRole;

test('viewer has the lowest level and no permissions', function () {
    expect(TeamRole::Viewer->level())->toBe(0)
        ->and(TeamRole::Viewer->permissions())->toBe([])
        ->and(TeamRole::Viewer->isAtLeast(TeamRole::Member))->toBeFalse();
});

test('member outranks viewer', function () {
    expect(TeamRole::Member->isAtLeast(TeamRole::Viewer))->toBeTrue()
        ->and(TeamRole::Member->level())->toBeGreaterThan(TeamRole::Viewer->level());
});

test('admins can manage members', function () {
    expect(TeamRole::Admin->hasPermission(TeamPermission::AddMember))->toBeTrue()
        ->and(TeamRole::Admin->hasPermission(TeamPermission::UpdateMember))->toBeTrue()
        ->and(TeamRole::Admin->hasPermission(TeamPermission::RemoveMember))->toBeTrue()
        ->and(TeamRole::Admin->hasPermission(TeamPermission::CreateInvitation))->toBeTrue();
});

test('admins cannot delete the team', function () {
    expect(TeamRole::Admin->hasPermission(TeamPermission::DeleteTeam))->toBeFalse();
});

test('viewer is assignable but owner is not', function () {
    $values = array_column(TeamRole::assignable(), 'value');

    expect($values)->toContain(TeamRole::Viewer->value)
        ->and($values)->toContain(TeamRole::Member->value)
        ->and($values)->not->toContain(TeamRole::Owner->value);
});
