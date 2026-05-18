<?php

use App\Http\Controllers\Analytics\AnalyticsController;
use App\Http\Controllers\Analytics\ConfigurationController;
use App\Http\Controllers\Teams\TeamInvitationController;
use App\Http\Middleware\EnsureTeamMembership;
use Illuminate\Support\Facades\Route;
use Laravel\Fortify\Features;

Route::inertia('/', 'welcome', [
    'canRegister' => Features::enabled(Features::registration()),
])->name('home');

Route::prefix('{current_team}')
    ->middleware(['auth', 'verified', EnsureTeamMembership::class])
    ->group(function () {
        Route::get('dashboard', fn (\App\Models\Team $current_team) => redirect("/{$current_team->slug}/analytics"))->name('dashboard');

        Route::get('analytics', [AnalyticsController::class, 'index'])->name('analytics.index');

        Route::get('configuration', [ConfigurationController::class, 'index'])->name('configuration.index');
        Route::patch('configuration/driver-configs/{driverConfig}', [ConfigurationController::class, 'updateDriverConfig'])->name('configuration.driver-configs.update');
        Route::post('configuration/expenses', [ConfigurationController::class, 'storeExpense'])->name('configuration.expenses.store');
        Route::patch('configuration/expenses/{teamExpense}', [ConfigurationController::class, 'updateExpense'])->name('configuration.expenses.update');
        Route::delete('configuration/expenses/{teamExpense}', [ConfigurationController::class, 'destroyExpense'])->name('configuration.expenses.destroy');
    });

Route::get('invitations/{invitation}/accept', [TeamInvitationController::class, 'accept'])->name('invitations.accept');

Route::middleware(['auth'])->group(function () {
    Route::post('invitations/{invitation}/accept', [TeamInvitationController::class, 'store'])->name('invitations.accept.store');
});

require __DIR__.'/settings.php';
