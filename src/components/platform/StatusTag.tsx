"use client";

import { StatusDot, Tag, type TagVariant } from "@/components/opai-ds";
import type { StatusVariant } from "@/lib/platform/status-ui";

const TAG: Record<StatusVariant, TagVariant> = {
  ok: "ok",
  warn: "warn",
  danger: "danger",
  info: "info",
  brand: "brand",
  neutral: "neutral",
};

const DOT: Record<StatusVariant, "ok" | "warn" | "danger" | "info" | "neutral"> = {
  ok: "ok",
  warn: "warn",
  danger: "danger",
  info: "info",
  brand: "info",
  neutral: "neutral",
};

export function StatusTag({
  label,
  variant,
}: {
  label: string;
  variant: StatusVariant;
}) {
  return (
    <Tag variant={TAG[variant]} size="sm" className="gap-1.5">
      <StatusDot kind={DOT[variant]} size="sm" />
      {label}
    </Tag>
  );
}
