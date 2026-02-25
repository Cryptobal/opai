"use client";

import { LayoutList, LayoutGrid, Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ViewMode = "list" | "cards" | "kanban";

const VIEW_CONFIG: Record<ViewMode, { icon: typeof LayoutList; title: string }> = {
  list: { icon: LayoutList, title: "Vista lista" },
  cards: { icon: LayoutGrid, title: "Vista tarjetas" },
  kanban: { icon: Columns3, title: "Vista kanban" },
};

interface ViewToggleProps {
  /** Which modes to show. Defaults to ["list", "cards"]. */
  modes?: ViewMode[];
  view: ViewMode;
  onChange: (view: ViewMode) => void;
}

export function ViewToggle({
  modes = ["list", "cards"],
  view,
  onChange,
}: ViewToggleProps) {
  return (
    <div className="flex items-center rounded-md border border-border">
      {modes.map((mode, idx) => {
        const config = VIEW_CONFIG[mode];
        const Icon = config.icon;
        const isActive = view === mode;
        const isFirst = idx === 0;
        const isLast = idx === modes.length - 1;

        return (
          <Button
            key={mode}
            size="icon"
            variant="ghost"
            className={cn(
              "h-8 w-8",
              !isFirst && "border-l border-border",
              isFirst && !isLast && "rounded-r-none",
              isLast && !isFirst && "rounded-l-none",
              !isFirst && !isLast && "rounded-none",
              isActive
                ? "bg-accent text-foreground"
                : "text-muted-foreground"
            )}
            onClick={() => onChange(mode)}
            title={config.title}
          >
            <Icon className="h-3.5 w-3.5" />
          </Button>
        );
      })}
    </div>
  );
}
