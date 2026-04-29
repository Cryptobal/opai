import { ReactNode } from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconBubble } from "./IconBubble";

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  /** CTA principal. */
  action?: ReactNode;
  /** Más sutil, link secundario. */
  secondary?: ReactNode;
  /** Variante visual. */
  tone?: "neutral" | "brand" | "ok" | "warn";
  /** Compactar (para empty states inline). */
  compact?: boolean;
  className?: string;
}

const TONE_TO_BUBBLE = {
  neutral: "neutral" as const,
  brand:   "brand" as const,
  ok:      "ok" as const,
  warn:    "warn" as const,
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondary,
  tone = "neutral",
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center text-center",
        compact ? "py-8 px-4 gap-3" : "py-14 px-6 gap-4",
        className,
      )}
    >
      <IconBubble
        icon={icon}
        variant={TONE_TO_BUBBLE[tone]}
        size={compact ? "lg" : "xl"}
      />
      <div className="space-y-1.5 max-w-md">
        <h3 className={cn(
          "font-display font-semibold text-ds-text-1",
          compact ? "text-base" : "text-lg sm:text-xl",
        )}>
          {title}
        </h3>
        {description && (
          <p className={cn(
            "text-ds-text-3 leading-relaxed",
            compact ? "text-[13px]" : "text-[14px] sm:text-[15px]",
          )}>
            {description}
          </p>
        )}
      </div>
      {(action || secondary) && (
        <div className="flex flex-col sm:flex-row items-center gap-2 mt-1">
          {action}
          {secondary}
        </div>
      )}
    </div>
  );
}
