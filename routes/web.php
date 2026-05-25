<?php

use App\Enums\TeamRole;
use App\Http\Controllers\Analytics\AnalyticsController;
use App\Http\Controllers\Analytics\ConfigurationController;
use App\Http\Controllers\Analytics\DashboardShareController;
use App\Http\Controllers\Teams\AdministrationController;
use App\Http\Controllers\Teams\TeamInvitationController;
use App\Http\Middleware\EnsureTeamMembership;
use App\Models\Team;
use Illuminate\Support\Facades\Route;
use Laravel\Fortify\Features;

Route::inertia('/', 'welcome', [
    'canRegister' => Features::enabled(Features::registration()),
])->name('home');

// Public, read-only shared dashboard — no login, revocable, rate-limited.
Route::get('shared/{share}', [DashboardShareController::class, 'show'])
    ->middleware('throttle:30,1')
    ->name('shared.show');

Route::prefix('{current_team}')
    ->middleware(['auth', 'verified'])
    ->group(function () {
        // Viewable by every team member, including Viewers.
        Route::middleware(EnsureTeamMembership::class)->group(function () {
            Route::get('dashboard', fn (Team $current_team) => redirect("/{$current_team->slug}/analytics"))->name('dashboard');
            Route::get('analytics', [AnalyticsController::class, 'index'])->name('analytics.index');
        });

        // Editing surfaces — Member and above (excludes Viewers).
        Route::middleware(EnsureTeamMembership::class.':'.TeamRole::Member->value)->group(function () {
            Route::post('shares', [DashboardShareController::class, 'store'])->name('shares.store');
            Route::delete('shares/{share}', [DashboardShareController::class, 'destroy'])->name('shares.destroy');

            Route::get('configuration', [ConfigurationController::class, 'index'])->name('configuration.index');

            Route::post('configuration/driver-configs', [ConfigurationController::class, 'storeDriverConfig'])->name('configuration.driver-configs.store');
            Route::patch('configuration/driver-configs/{driverConfig}', [ConfigurationController::class, 'updateDriverConfig'])->name('configuration.driver-configs.update');
            Route::post('configuration/driver-configs/{driverConfig}/rates', [ConfigurationController::class, 'storeDriverConfigRate'])->name('configuration.driver-configs.rates.store');
            Route::patch('configuration/driver-configs/{driverConfig}/rates/{driverConfigRate}', [ConfigurationController::class, 'updateDriverConfigRate'])->name('configuration.driver-configs.rates.update');
            Route::delete('configuration/driver-configs/{driverConfig}/rates/{driverConfigRate}', [ConfigurationController::class, 'destroyDriverConfigRate'])->name('configuration.driver-configs.rates.destroy');

            Route::post('configuration/expenses', [ConfigurationController::class, 'storeExpense'])->name('configuration.expenses.store');
            Route::patch('configuration/expenses/{teamExpense}', [ConfigurationController::class, 'updateExpense'])->name('configuration.expenses.update');
            Route::delete('configuration/expenses/{teamExpense}', [ConfigurationController::class, 'destroyExpense'])->name('configuration.expenses.destroy');
            Route::post('configuration/expenses/{teamExpense}/rates', [ConfigurationController::class, 'storeExpenseRate'])->name('configuration.expenses.rates.store');
            Route::patch('configuration/expenses/{teamExpense}/rates/{teamExpenseRate}', [ConfigurationController::class, 'updateExpenseRate'])->name('configuration.expenses.rates.update');
            Route::delete('configuration/expenses/{teamExpense}/rates/{teamExpenseRate}', [ConfigurationController::class, 'destroyExpenseRate'])->name('configuration.expenses.rates.destroy');
        });
    });

// Administration — team & user management (replaces the old settings/teams pages).
Route::middleware(['auth', 'verified'])->group(function () {
    Route::get('administration', [AdministrationController::class, 'index'])->name('administration.index');
    Route::get('administration/teams/{team}', [AdministrationController::class, 'show'])
        ->middleware(EnsureTeamMembership::class.':'.TeamRole::Admin->value)
        ->name('administration.teams.show');
});

Route::get('invitations/{invitation}/accept', [TeamInvitationController::class, 'accept'])->name('invitations.accept');

Route::middleware(['auth'])->group(function () {
    Route::post('invitations/{invitation}/accept', [TeamInvitationController::class, 'store'])->name('invitations.accept.store');
});

require __DIR__.'/settings.php';
