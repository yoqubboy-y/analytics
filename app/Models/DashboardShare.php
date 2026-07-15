<?php

namespace App\Models;

use Database\Factories\DashboardShareFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'team_id',
    'token',
    'start_date',
    'end_date',
    'basis',
    'widgets',
    'created_by',
    'expires_at',
    'revoked_at',
])]
class DashboardShare extends Model
{
    /** @use HasFactory<DashboardShareFactory> */
    use HasFactory;

    /**
     * Widget keys a share may scope to. Null = the whole dashboard.
     *
     * @var list<string>
     */
    public const WIDGETS = [
        'key_metrics',
        'dispatcher_chart',
        'dispatcher_rankings',
        'pnl_table',
    ];

    /**
     * Get the casts for this model.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'start_date' => 'date',
            'end_date' => 'date',
            'widgets' => 'array',
            'expires_at' => 'datetime',
            'revoked_at' => 'datetime',
        ];
    }

    /**
     * Use the public token as the route key.
     */
    public function getRouteKeyName(): string
    {
        return 'token';
    }

    /**
     * Get the team this share exposes.
     *
     * @return BelongsTo<Team, $this>
     */
    public function team(): BelongsTo
    {
        return $this->belongsTo(Team::class);
    }

    /**
     * Get the user who created this share.
     *
     * @return BelongsTo<User, $this>
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Determine whether this share is still viewable (not revoked or expired).
     */
    public function isActive(): bool
    {
        return $this->revoked_at === null
            && ($this->expires_at === null || $this->expires_at->isFuture());
    }
}
