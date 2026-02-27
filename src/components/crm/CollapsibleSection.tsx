"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronDown, ChevronRight } from "lucide-react";

interface CollapsibleSectionProps {
  icon?: React.ReactNode;
  title: string;
  count?: number;
  /** Optional badge text shown next to the title (e.g. "6 campos") */
  badge?: string;
  /** Text shown inline when the section is collapsed AND has no children content */
  emptyText?: string;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: (nextOpen: boolean) => void;
  action?: React.ReactNode;
  dragHandle?: React.ReactNode;
  locked?: boolean;
  /** Mantener children montados cuando cerrado (para refs que deben estar disponibles) */
  keepMounted?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function CollapsibleSection({
  icon,
  title,
  count,
  badge,
  emptyText,
  defaultOpen = true,
  open,
  onToggle,
  action,
  dragHandle,
  locked = false,
  keepMounted = false,
  children,
  className = "",
}: CollapsibleSectionProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = typeof open === "boolean";
  const resolvedOpen = useMemo(() => {
    const base = isControlled ? Boolean(open) : internalOpen;
    return locked ? true : base;
  }, [internalOpen, isControlled, locked, open]);

  const handleToggle = () => {
    if (locked) return;
    const nextOpen = !resolvedOpen;
    if (!isControlled) setInternalOpen(nextOpen);
    onToggle?.(nextOpen);
  };

  return (
    <Card className={className}>
      <CardHeader className="p-4 pb-3 sm:p-6 sm:pb-4">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleToggle}
            className="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-primary transition-colors -ml-0.5 group"
            disabled={locked}
          >
            {resolvedOpen ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0" />
            )}
            {dragHandle}
            <CardTitle className="flex min-w-0 items-center gap-2 text-sm">
              {icon}
              {title}
              {count !== undefined && (
                <span className="text-[10px] text-muted-foreground font-normal">
                  ({count})
                </span>
              )}
              {badge && (
                <span className="text-[10px] text-muted-foreground font-normal rounded bg-muted px-1.5 py-0.5">
                  {badge}
                </span>
              )}
              {!resolvedOpen && emptyText && (
                <span className="text-[11px] text-muted-foreground/60 font-normal ml-1">
                  — {emptyText}
                </span>
              )}
            </CardTitle>
          </button>
          {action && (
            <div className="shrink-0 flex items-center" onClick={(e) => e.stopPropagation()}>
              {action}
            </div>
          )}
        </div>
      </CardHeader>
      <AnimatePresence initial={false}>
        {resolvedOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <CardContent className="px-4 pt-2 sm:px-6 sm:pt-2">{children}</CardContent>
          </motion.div>
        )}
      </AnimatePresence>
      {keepMounted && !resolvedOpen && (
        <div className="hidden" aria-hidden>
          <CardContent className="px-4 pt-4 sm:px-6">{children}</CardContent>
        </div>
      )}
    </Card>
  );
}
