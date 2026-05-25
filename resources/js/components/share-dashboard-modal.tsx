import { router } from '@inertiajs/react';
import { format } from 'date-fns';
import { CheckIcon, CopyIcon, LinkIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import {
    destroy as destroyShare,
    store as storeShare,
} from '@/actions/App/Http/Controllers/Analytics/DashboardShareController';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { DASHBOARD_WIDGETS, widgetScopeLabel } from '@/lib/dashboard-widgets';

export type DashboardShareItem = {
    token: string;
    url: string;
    start_date: string;
    end_date: string;
    widgets: string[] | null;
    expires_at: string | null;
    created_at: string;
};

interface ShareDashboardModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    slug: string;
    startDate: string;
    endDate: string;
    shares: DashboardShareItem[];
}

const VISIT = { preserveScroll: true, preserveState: true } as const;

const fmtRange = (start: string, end: string) =>
    `${format(new Date(start + 'T00:00:00'), 'MMM d')} – ${format(new Date(end + 'T00:00:00'), 'MMM d, yyyy')}`;

export function ShareDashboardModal({
    open,
    onOpenChange,
    slug,
    startDate,
    endDate,
    shares,
}: ShareDashboardModalProps) {
    const [copied, setCopied] = useState<string | null>(null);
    const [selectedWidgets, setSelectedWidgets] = useState<string[]>(() =>
        DASHBOARD_WIDGETS.map((w) => w.key),
    );

    function toggleWidget(key: string) {
        setSelectedWidgets((prev) =>
            prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
        );
    }

    function createShare() {
        if (selectedWidgets.length === 0) {
            return;
        }

        router[storeShare(slug).method](
            storeShare.url(slug),
            {
                start_date: startDate,
                end_date: endDate,
                widgets: selectedWidgets,
            },
            VISIT,
        );
    }

    function revokeShare(token: string) {
        router[destroyShare([slug, token]).method](
            destroyShare.url([slug, token]),
            VISIT,
        );
    }

    async function copyLink(url: string, token: string) {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(token);
            setTimeout(() => setCopied((t) => (t === token ? null : t)), 1500);
        } catch {
            // Clipboard may be unavailable (e.g. insecure context); ignore.
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Share dashboard</DialogTitle>
                    <DialogDescription>
                        Anyone with a link can view a read-only dashboard for
                        its period — no account needed. Data stays live. Revoke
                        a link any time.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex min-w-0 flex-col gap-3 rounded-lg border bg-muted/30 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                        <div className="text-sm">
                            <div className="font-medium">Current period</div>
                            <div className="text-muted-foreground">
                                {fmtRange(startDate, endDate)}
                            </div>
                        </div>
                        <Button
                            type="button"
                            onClick={createShare}
                            disabled={selectedWidgets.length === 0}
                            className="gap-1.5"
                        >
                            <LinkIcon className="h-4 w-4" />
                            Create link
                        </Button>
                    </div>

                    <div className="flex flex-col gap-2 border-t pt-3">
                        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                            Include
                        </p>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {DASHBOARD_WIDGETS.map((widget) => (
                                <label
                                    key={widget.key}
                                    className="flex cursor-pointer items-center gap-2 text-sm"
                                >
                                    <Checkbox
                                        checked={selectedWidgets.includes(
                                            widget.key,
                                        )}
                                        onCheckedChange={() =>
                                            toggleWidget(widget.key)
                                        }
                                    />
                                    <span>{widget.label}</span>
                                </label>
                            ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Leave all selected to share the whole dashboard.
                        </p>
                    </div>
                </div>

                <div className="flex min-w-0 flex-col gap-2">
                    <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                        Active links
                    </p>

                    {shares.length === 0 ? (
                        <p className="rounded-lg border bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
                            No active links yet.
                        </p>
                    ) : (
                        <div className="flex min-w-0 flex-col gap-2">
                            {shares.map((share) => (
                                <div
                                    key={share.token}
                                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border px-3 py-2"
                                >
                                    <div className="min-w-0">
                                        <div className="truncate text-sm font-medium">
                                            {fmtRange(
                                                share.start_date,
                                                share.end_date,
                                            )}
                                        </div>
                                        <div className="truncate text-xs text-muted-foreground">
                                            {share.url}
                                        </div>
                                        <div className="truncate text-xs text-muted-foreground">
                                            {widgetScopeLabel(share.widgets)}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="gap-1.5"
                                            onClick={() =>
                                                copyLink(share.url, share.token)
                                            }
                                        >
                                            {copied === share.token ? (
                                                <CheckIcon className="h-3.5 w-3.5" />
                                            ) : (
                                                <CopyIcon className="h-3.5 w-3.5" />
                                            )}
                                            {copied === share.token
                                                ? 'Copied'
                                                : 'Copy'}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-destructive"
                                            aria-label="Revoke link"
                                            title="Revoke link"
                                            onClick={() =>
                                                revokeShare(share.token)
                                            }
                                        >
                                            <Trash2Icon className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
