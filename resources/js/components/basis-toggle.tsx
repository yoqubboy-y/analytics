import { addDays, format } from 'date-fns';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * KPI ↔ Actual expense-basis switch. "Actual" swaps the truck/trailer/fuel/
 * toll/maintenance expenses for real per-unit dollars; it's only selectable
 * when the whole selected range is covered by loaded actuals.
 */
export function BasisToggle({
    basis,
    actualAvailable,
    coveredRange,
    onChange,
}: {
    basis: 'kpi' | 'actual';
    actualAvailable: boolean;
    coveredRange: [string, string] | null;
    onChange: (b: 'kpi' | 'actual') => void;
}) {
    const btn = (value: 'kpi' | 'actual', label: string, disabled = false) => (
        <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(value)}
            className={cn(
                'h-7 rounded px-2.5 text-xs font-medium transition-colors',
                basis === value
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                disabled &&
                    'cursor-not-allowed opacity-40 hover:text-muted-foreground',
            )}
        >
            {label}
        </button>
    );

    const coveredHint = coveredRange
        ? `Actuals cover ${format(new Date(coveredRange[0] + 'T00:00:00'), 'MMM d')}–${format(
              addDays(new Date(coveredRange[1] + 'T00:00:00'), 6),
              'MMM d',
          )}`
        : 'No actuals loaded yet';

    return (
        <div className="flex h-8 items-center gap-0.5 rounded-md border bg-muted/40 p-0.5">
            {btn('kpi', 'KPI')}
            {actualAvailable ? (
                btn('actual', 'Actual')
            ) : (
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span tabIndex={0}>{btn('actual', 'Actual', true)}</span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{coveredHint}</TooltipContent>
                </Tooltip>
            )}
        </div>
    );
}
