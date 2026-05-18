import { MoonIcon, SunIcon } from "lucide-react";

import { useAppearance } from "@/hooks/use-appearance";
import { Toggle } from "@/components/ui/toggle";

export default function ThemeToggle() {
  const { resolvedAppearance, updateAppearance } = useAppearance();
  const isDark = resolvedAppearance === "dark";

  return (
    <Toggle
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      className="group size-8 rounded-full border-none text-muted-foreground shadow-none data-[state=on]:bg-transparent data-[state=on]:text-muted-foreground data-[state=on]:hover:bg-muted data-[state=on]:hover:text-foreground"
      onPressedChange={() => updateAppearance(isDark ? "light" : "dark")}
      pressed={isDark}
      variant="outline"
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
