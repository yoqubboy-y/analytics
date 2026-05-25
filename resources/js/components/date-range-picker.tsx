import {
    addDays,
    differenceInCalendarDays,
    endOfMonth,
    endOfWeek,
    format,
    startOfMonth,
    startOfWeek,
    subDays,
    subMonths,
    subWeeks,
} from 'date-fns';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

const WEEK = { weekStartsOn: 1 } as const;

function fmtIso(d: Date) {
    return format(d, 'yyyy-MM-dd');
}

interface Preset {
    label: string;
    range: () => { from: Date; to: Date };
}

// Presets are anchored to "now". Week presets start on Monday to match the
// reporting week; multi-week presets are contiguous windows ending this week.
const PRESETS: Preset[] = [
    {
        label: 'This week',
        range: () => ({
            from: startOfWeek(new Date(), WEEK),
            to: endOfWeek(new Date(), WEEK),
        }),
    },
    {
        label: 'Last week',
        range: () => {
            const d = subWeeks(new Date(), 1);

            return { from: startOfWeek(d, WEEK), to: endOfWeek(d, WEEK) };
        },
    },
    {
        label: 'Last 2 weeks',
        range: () => ({
            from: startOfWeek(subWeeks(new Date(), 1), WEEK),
            to: endOfWeek(new Date(), WEEK),
        }),
    },
    {
        label: 'Last 3 weeks',
        range: () => ({
            from: startOfWeek(subWeeks(new Date(), 2), WEEK),
            to: endOfWeek(new Date(), WEEK),
        }),
    },
    {
        label: 'This month',
        range: () => ({
            from: startOfMonth(new Date()),
            to: endOfMonth(new Date()),
        }),
    },
    {
        label: 'Last month',
        range: () => {
            const d = subMonths(new Date(), 1);

            return { from: startOfMonth(d), to: endOfMonth(d) };
        },
    },
];

interface DateRangePickerProps {
    startDate: string;
    endDate: string;
    onRangeChange: (startDate: string, endDate: string) => void;
}

export function DateRangePicker({
    startDate,
    endDate,
    onRangeChange,
}: DateRangePickerProps) {
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');

    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<DateRange | undefined>({
        from: start,
        to: end,
    });
    const [displayMonth, setDisplayMonth] = useState<Date>(start);

    const rangeText = `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;

    function apply(from: Date, to: Date) {
        const [a, b] = from <= to ? [from, to] : [to, from];
        // Reports run on whole weeks: snap the start to its Monday and the end
        // to its Sunday, so any picked dates expand to full Mon–Sun weeks.
        const weekStart = startOfWeek(a, WEEK);
        const weekEnd = endOfWeek(b, WEEK);
        setDraft({ from: weekStart, to: weekEnd });
        onRangeChange(fmtIso(weekStart), fmtIso(weekEnd));
        setOpen(false);
    }

    function handlePreset(preset: Preset) {
        const { from, to } = preset.range();
        setDisplayMonth(from);
        apply(from, to);
    }

    function handleSelect(range: DateRange | undefined) {
        setDraft(range);

        // Apply only once both ends are chosen.
        if (range?.from && range?.to) {
            apply(range.from, range.to);
        }
    }

    function shiftPeriod(direction: -1 | 1) {
        const length = differenceInCalendarDays(end, start) + 1;
        const [from, to] =
            direction === -1
                ? [subDays(start, length), subDays(start, 1)]
                : [addDays(end, 1), addDays(end, length)];
        setDisplayMonth(from);
        apply(from, to);
    }

    function handleOpenChange(next: boolean) {
        if (next) {
            // Reset the draft to the live range whenever the popover reopens.
            setDraft({ from: start, to: end });
            setDisplayMonth(start);
        }

        setOpen(next);
    }

    return (
        <div className="flex items-center gap-1">
            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => shiftPeriod(-1)}
                aria-label="Previous period"
            >
                <ChevronLeftIcon className="h-4 w-4" />
            </Button>

            <Popover open={open} onOpenChange={handleOpenChange}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        className="h-8 gap-2 text-sm font-medium"
                    >
                        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                        {rangeText}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                    <div className="flex flex-col sm:flex-row">
                        <div className="flex shrink-0 flex-col gap-0.5 border-b p-2 sm:border-r sm:border-b-0">
                            {PRESETS.map((preset) => (
                                <button
                                    key={preset.label}
                                    type="button"
                                    onClick={() => handlePreset(preset)}
                                    className="rounded-md px-3 py-1.5 text-left text-sm whitespace-nowrap transition-colors hover:bg-accent"
                                >
                                    {preset.label}
                                </button>
                            ))}
                        </div>

                        <div className="flex flex-col gap-3 p-3">
                            <div className="flex items-center justify-center gap-2">
                                <Select
                                    value={String(displayMonth.getMonth())}
                                    onValueChange={(v) => {
                                        const d = new Date(displayMonth);
                                        d.setMonth(parseInt(v));
                                        setDisplayMonth(d);
                                    }}
                                >
                                    <SelectTrigger className="h-8 w-32 font-medium">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Array.from({ length: 12 }, (_, i) => (
                                            <SelectItem
                                                key={i}
                                                value={String(i)}
                                            >
                                                {format(
                                                    new Date(2000, i, 1),
                                                    'MMMM',
                                                )}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                <Select
                                    value={String(displayMonth.getFullYear())}
                                    onValueChange={(v) => {
                                        const d = new Date(displayMonth);
                                        d.setFullYear(parseInt(v));
                                        setDisplayMonth(d);
                                    }}
                                >
                                    <SelectTrigger className="h-8 w-24 font-medium">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Array.from({ length: 11 }, (_, i) => {
                                            const year = 2020 + i;

                                            return (
                                                <SelectItem
                                                    key={year}
                                                    value={String(year)}
                                                >
                                                    {year}
                                                </SelectItem>
                                            );
                                        })}
                                    </SelectContent>
                                </Select>
                            </div>

                            <Calendar
                                mode="range"
                                weekStartsOn={1}
                                numberOfMonths={2}
                                selected={draft}
                                onSelect={handleSelect}
                                month={displayMonth}
                                onMonthChange={setDisplayMonth}
                                showOutsideDays={false}
                            />
                            <p className="text-center text-xs text-muted-foreground">
                                Ranges snap to whole weeks (Mon–Sun).
                            </p>
                        </div>
                    </div>
                </PopoverContent>
            </Popover>

            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => shiftPeriod(1)}
                aria-label="Next period"
            >
                <ChevronRightIcon className="h-4 w-4" />
            </Button>
        </div>
    );
}
