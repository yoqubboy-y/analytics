import { format, startOfWeek } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

function mondayOf(date: Date): Date {
    return startOfWeek(date, { weekStartsOn: 1 });
}

/** Normalise a date string (or today) to its ISO week's Monday, as `yyyy-MM-dd`. */
export function isoMonday(dateStr?: string): string {
    const base = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();

    return format(mondayOf(base), 'yyyy-MM-dd');
}

interface WeekPickerProps {
    /** A `yyyy-MM-dd` date; always snapped to its week's Monday. */
    value: string;
    onChange: (monday: string) => void;
    id?: string;
    className?: string;
}

export function WeekPicker({
    value,
    onChange,
    id,
    className,
}: WeekPickerProps) {
    const [open, setOpen] = useState(false);
    const selected = new Date(value + 'T00:00:00');

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    id={id}
                    type="button"
                    variant="outline"
                    className={cn('justify-start gap-2 font-normal', className)}
                >
                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    Week of {format(selected, 'MMM d, yyyy')}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                    mode="single"
                    weekStartsOn={1}
                    selected={selected}
                    defaultMonth={selected}
                    onSelect={(d) => {
                        if (!d) {
                            return;
                        }

                        onChange(format(mondayOf(d), 'yyyy-MM-dd'));
                        setOpen(false);
                    }}
                    showOutsideDays={false}
                />
            </PopoverContent>
        </Popover>
    );
}
