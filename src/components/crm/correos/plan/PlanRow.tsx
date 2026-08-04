"use client";

import { ChevronRight } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Tag } from "@/components/opai-ds";
import type { PlanActionTag } from "../CorreoAiPlanCard";

const TAG_VARIANT: Record<PlanActionTag, "ok" | "info" | "neutral" | "warn"> = {
  nueva: "ok",
  reutiliza: "info",
  calculado: "neutral",
  opcional: "warn",
  automatico: "info",
  licitación: "info",
  cotización: "ok",
};

const TAG_LABEL: Record<PlanActionTag, string> = {
  nueva: "nueva",
  reutiliza: "reutiliza",
  calculado: "calculado",
  opcional: "opcional",
  automatico: "automático",
  licitación: "licitación",
  cotización: "cotización",
};

type Props = {
  id: string;
  label: string;
  detail?: string;
  tag?: PlanActionTag;
  tagLabel?: string;
  checked: boolean;
  disabled?: boolean;
  locked?: boolean;
  onToggle: (id: string) => void;
  expanded: boolean;
  onExpand: (id: string) => void;
  children?: React.ReactNode;
  reasonDisabled?: string;
};

/**
 * Expandable action row: checkbox + label + tag + chevron.
 * Children are rendered below when expanded.
 */
export function PlanRow({
  id,
  label,
  detail,
  tag,
  tagLabel,
  checked,
  disabled,
  locked,
  onToggle,
  expanded,
  onExpand,
  children,
  reasonDisabled,
}: Props) {
  const isLockedOrDisabled = Boolean(disabled || locked);
  const rowBg = isLockedOrDisabled
    ? "border-ds-border-subtle bg-ds-surface-2 opacity-80"
    : checked
      ? "border-tint-violet/40 bg-tint-violet/5"
      : "border-ds-border-subtle bg-ds-surface-1";

  return (
    <li className="overflow-hidden rounded-xl border">
      <div
        className={`flex min-h-11 items-start gap-3 px-3 py-2.5 ${rowBg} ${isLockedOrDisabled ? "cursor-not-allowed" : "cursor-pointer ds-tap"}`}
      >
        <Checkbox
          className="mt-0.5 h-5 w-5 shrink-0"
          checked={locked || checked}
          disabled={isLockedOrDisabled}
          onCheckedChange={() => !isLockedOrDisabled && onToggle(id)}
          aria-label={label}
          onClick={(e) => e.stopPropagation()}
        />
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
          onClick={() => !isLockedOrDisabled && onExpand(id)}
          tabIndex={children ? 0 : -1}
        >
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="text-[13px] font-medium text-ds-text-1">{label}</span>
              {tag && (
                <Tag variant={TAG_VARIANT[tag]} size="sm">
                  {tagLabel ?? TAG_LABEL[tag]}
                </Tag>
              )}
              {locked && (
                <Tag variant="neutral" size="sm">bloqueado</Tag>
              )}
            </span>
            {detail && (
              <span className="mt-0.5 block text-[12px] text-ds-text-3">{detail}</span>
            )}
            {disabled && reasonDisabled && (
              <span className="mt-0.5 block text-[12px] text-ds-text-4 italic">
                {reasonDisabled}
              </span>
            )}
          </span>
          {children && (
            <ChevronRight
              className={`mt-0.5 h-4 w-4 shrink-0 text-ds-text-4 transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
            />
          )}
        </button>
      </div>
      {expanded && children && (
        <div className="border-t border-ds-border-subtle bg-ds-surface-2 px-3 py-3">
          {children}
        </div>
      )}
    </li>
  );
}
