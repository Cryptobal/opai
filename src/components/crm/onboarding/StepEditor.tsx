"use client";

import { useState } from "react";
import { Trash2, ChevronDown, Calendar } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  type OnboardingStepDraft,
  PRIORITY_OPTIONS,
  TEAM_OPTIONS,
} from "./types";

const PRIO_COLOR: Record<string, string> = {
  p1: "bg-status-danger/15 text-status-danger-fg",
  p2: "bg-status-warn/15 text-status-warn-fg",
  p3: "bg-status-info/15 text-status-info-fg",
  p4: "bg-ds-text-4/20 text-ds-text-2",
  p5: "bg-ds-text-4/20 text-ds-text-2",
};

const TEAM_COLOR: Record<string, string> = {
  ops: "bg-primary/10 text-primary",
  finanzas: "bg-status-ok/15 text-status-ok-fg",
  inventario: "bg-status-info/15 text-status-info-fg",
  rrhh: "bg-status-warn/15 text-status-warn-fg",
  comercial: "bg-status-danger/15 text-status-danger-fg",
  soporte: "bg-ds-text-4/20 text-ds-text-2",
};

function fmtDate(d: Date): string {
  return d.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
  });
}

export function StepEditor({
  step,
  serviceStartDate,
  onChange,
  onRemove,
}: {
  step: OnboardingStepDraft;
  serviceStartDate: string | null;
  onChange: (next: OnboardingStepDraft) => void;
  onRemove?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const startDate = serviceStartDate ? new Date(serviceStartDate) : null;
  const dueDate =
    startDate && !Number.isNaN(startDate.getTime())
      ? new Date(startDate.getTime() + step.dueDateOffsetDays * 86_400_000)
      : null;

  const teamLabel =
    TEAM_OPTIONS.find((t) => t.value === step.assignedTeam)?.label ??
    step.assignedTeam;
  const prioLabel =
    PRIORITY_OPTIONS.find((p) => p.value === step.priority)?.label ??
    step.priority;

  return (
    <div
      className={cn(
        "group rounded-xl border bg-ds-surface-1 transition-all",
        step.applies
          ? "border-ds-border-default"
          : "border-ds-border-default/60 bg-ds-surface-1/60",
      )}
    >
      <div className="flex items-center gap-3 px-3.5 py-2.5">
        <Checkbox
          checked={step.applies}
          onCheckedChange={(v) => onChange({ ...step, applies: !!v })}
          className="shrink-0"
        />

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex flex-1 items-center justify-between gap-2 text-left"
          disabled={!step.applies}
        >
          <span
            className={cn(
              "truncate text-sm font-medium",
              step.applies
                ? "text-ds-text-1"
                : "text-ds-text-3 line-through decoration-ds-text-4",
            )}
          >
            {step.title}
          </span>

          {step.applies ? (
            <span className="flex shrink-0 items-center gap-1.5">
              <span
                className={cn(
                  "rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  PRIO_COLOR[step.priority] ?? PRIO_COLOR.p3,
                )}
              >
                {step.priority}
              </span>
              <span
                className={cn(
                  "hidden rounded-md px-1.5 py-0.5 text-[10px] font-medium sm:inline-block",
                  TEAM_COLOR[step.assignedTeam] ?? TEAM_COLOR.ops,
                )}
              >
                {teamLabel}
              </span>
              {dueDate ? (
                <span className="hidden items-center gap-1 text-[11px] text-ds-text-3 sm:flex">
                  <Calendar className="h-3 w-3" />
                  {fmtDate(dueDate)}
                </span>
              ) : null}
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-ds-text-3 transition-transform",
                  expanded && "rotate-180",
                )}
              />
            </span>
          ) : null}
        </button>

        {step.isCustom && onRemove ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemove}
            aria-label="Quitar ticket"
            className="h-7 w-7 text-ds-text-3 hover:text-status-danger-fg"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>

      {step.applies && expanded ? (
        <div className="grid grid-cols-1 gap-3 border-t border-ds-border-default/60 px-3.5 py-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-ds-text-3">
              Equipo
            </label>
            <select
              value={step.assignedTeam}
              onChange={(e) =>
                onChange({ ...step, assignedTeam: e.target.value })
              }
              className="w-full rounded-md border border-ds-border-default bg-ds-surface-0 px-2 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
            >
              {TEAM_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-ds-text-3">
              Prioridad
            </label>
            <select
              value={step.priority}
              onChange={(e) =>
                onChange({ ...step, priority: e.target.value })
              }
              className="w-full rounded-md border border-ds-border-default bg-ds-surface-0 px-2 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
            >
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-ds-text-3">
              Offset (días)
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={step.dueDateOffsetDays}
                onChange={(e) =>
                  onChange({
                    ...step,
                    dueDateOffsetDays:
                      Number.parseInt(e.target.value, 10) || 0,
                  })
                }
                className="h-9 text-sm"
              />
              <span className="text-[11px] tabular-nums text-ds-text-3">
                {dueDate ? fmtDate(dueDate) : "—"}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
