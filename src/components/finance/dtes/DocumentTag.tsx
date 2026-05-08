"use client";

import { Tag } from "@/components/opai-ds";
import { DTE_TYPE_SHORT_LABELS, DTE_TYPE_TAG_VARIANT } from "./shared/constants";

interface Props {
  dteType: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Tag semántico de tipo de DTE. Usa DS v3 Tag con variants por tipo.
 * Reemplaza el patrón <Badge variant="outline" className={cn(...)}>
 * que existía en FacturacionClient.tsx.
 */
export function DocumentTag({ dteType, size = "sm", className }: Props) {
  const variant = DTE_TYPE_TAG_VARIANT[dteType] ?? "neutral";
  const label = DTE_TYPE_SHORT_LABELS[dteType] ?? `Tipo ${dteType}`;
  return (
    <Tag variant={variant} size={size} className={className}>
      {label}
    </Tag>
  );
}
