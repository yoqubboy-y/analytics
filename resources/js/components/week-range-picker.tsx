import { useState } from 'react';
import { endOfWeek, format, startOfWeek } from 'date-fns';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
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

interface WeekRangePickerProps {
    startDate: string;
    endDate: string;
    onWeekChange: (startDate: string, endDate: string) => void;
}

function toWeekBounds(date: Date): { start: Date; end: Date } {
    return {
        start: startOfWeek(date, { weekStartsOn: 1 }),
        end: endOfWeek(date, { weekStartsOn: 1 }),
    };
}

function fmt(d: Date) {
    return format(d, 'yyyy-MM-dd');
}

export function WeekRangePicker({
    startDate,
    endDate,
    onWeekChange,
}: WeekRangePickerProps) {
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');

    const [open, setOpen] = useState(false);
    const [displayMonth, setDisplayMonth] = useState<Date>(start);
    const [selectedRange, setSelectedRange] = useState<DateRange | undefined>({
        from: start,
        to: end,
    });

    const weekRangeText = `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;

    function handleDayClick(clicked: Date | undefined) {
        if (!clicked) return;
        const { start: ws, end: we } = toWeekBounds(clicked);
        setSelectedRange({ from: ws, to: we });
        onWeekChange(fmt(ws), fmt(we));
        setOpen(false);
    }

    function shiftWeek(direction: -1 | 1) {
        const shifted = new Date(start);
        shifted.setDate(shifted.getDate() + direction * 7);
        const { start: ws, end: we } = toWeekBounds(shifted);
        setSelectedRange({ from: ws, to: we });
        setDisplayMonth(ws);
        onWeekChange(fmt(ws), fmt(we));
    }

    return (
        <div className="flex items-center gap-1">
            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => shiftWeek(-1)}
                aria-label="Previous week"
            >
                <ChevronLeftIcon className="h-4 w-4" />
            </Button>

            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        className="h-8 gap-2 text-sm font-medium"
                    >
                        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                        {weekRangeText}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-3" align="end">
                    <div className="flex flex-col gap-3">
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
                                        <SelectItem key={i} value={String(i)}>
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
                            selected={selectedRange}
                            onSelect={(range) => {
                                if (range?.from) handleDayClick(range.from);
                            }}
                            onDayClick={handleDayClick}
                            month={displayMonth}
                            onMonthChange={setDisplayMonth}
                            showOutsideDays={false}
                        />
                    </div>
                </PopoverContent>
            </Popover>

            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => shiftWeek(1)}
                aria-label="Next week"
            >
                <ChevronRightIcon className="h-4 w-4" />
            </Button>
        </div>
    );
}
