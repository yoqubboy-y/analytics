import { MoonIcon, SunIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useAppearance } from '@/hooks/use-appearance';
import { Toggle } from '@/components/ui/toggle';

export default function ThemeToggle() {
    const { resolvedAppearance, updateAppearance } = useAppearance();
    // The server has no access to the user's stored theme, so it renders a
    // neutral placeholder until after first client paint. This avoids the
    // SSR/CSR `aria-pressed` / `data-state` mismatch on the toggle.
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);

    const isDark = mounted && resolvedAppearance === 'dark';

    return (
        <Toggle
            aria-label={mounted ? `Switch to ${isDark ? 'light' : 'dark'} mode` : 'Toggle theme'}
            className="group size-8 rounded-full border-none text-muted-foreground shadow-none data-[state=on]:bg-transparent data-[state=on]:text-muted-foreground data-[state=on]:hover:bg-muted data-[state=on]:hover:text-foreground"
            onPressedChange={() => updateAppearance(isDark ? 'light' : 'dark')}
            pressed={isDark}
            variant="outline"
            suppressHydrationWarning
        >
            <MoonIcon
                aria-hidden="true"
                className="shrink-0 scale-0 opacity-0 transition-all group-data-[state=on]:scale-100 group-data-[state=on]:opacity-100"
                size={16}
            />
            <SunIcon
                aria-hidden="true"
                className="absolute shrink-0 scale-100 opacity-100 transition-all group-data-[state=on]:scale-0 group-data-[state=on]:opacity-0"
                size={16}
            />
        </Toggle>
    );
}
