"use client";

import { cn } from "@/lib/utils";
import { Tag, type TagVariant } from "@/components/opai-ds";
import { SII_STATUS_CONFIG } from "./shared/constants";

const VARIANT_BY_STATUS: Record<string, TagVariant> = {
  PENDING: "warn",
  ACCEPTED: "ok",
  REJECTED: "danger",
  ANNULLED: "neutral",
};

interface Props {
  siiStatus: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Pill de estado SII con dot a la izquierda. DRAFT usa tono violet
 * preservando el visual previo (no hay variant violet en DS v3 Tag).
 */
export function SiiStatusPill({ siiStatus, size = "sm", className }: Props) {
  const cfg = SII_STATUS_CONFIG[siiStatus];
  const label = cfg?.label ?? siiStatus;

  // Caso DRAFT: tono violeta categórico (borrador) — no existe variant
  // violet en DS v3 Tag. Usa tokens tint-violet del DS.
  if (siiStatus === "DRAFT") {
    const sizeCls =
      size === "lg" ? "h-7 px-3 text-sm" :
      size === "md" ? "h-6 px-2.5 text-xs" :
      "h-5 px-2 text-xs";
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border font-medium leading-none whitespace-nowrap",
          "bg-tint-violet text-tint-violet-fg border-tint-violet-fg/30",
          sizeCls,
          className,
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-tint-violet-fg" />
        {label}
      </span>
    );
  }

  const variant = VARIANT_BY_STATUS[siiStatus] ?? "neutral";
  return (
    <Tag variant={variant} size={size} dot className={className}>
      {label}
    </Tag>
  );
}
