"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  type OnboardingStepDraft,
  PRIORITY_OPTIONS,
  TEAM_OPTIONS,
} from "./types";

function fmtDate(d: Date): string {
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short" });
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
  const startDate = serviceStartDate ? new Date(serviceStartDate) : null;
  const dueDate =
    startDate && !Number.isNaN(startDate.getTime())
      ? new Date(startDate.getTime() + step.dueDateOffsetDays * 86_400_000)
      : null;

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <label className="flex items-center gap-2 flex-1">
          <Checkbox
            checked={step.applies}
            onCheckedChange={(v) => onChange({ ...step, applies: !!v })}
          />
          <span
            className={`text-sm font-medium ${
              step.applies ? "" : "text-muted-foreground line-through"
            }`}
          >
            {step.title}
          </span>
        </label>
        {step.isCustom && onRemove ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            aria-label="Quitar ticket custom"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      {step.applies ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Equipo</Label>
            <select
              value={step.assignedTeam}
              onChange={(e) =>
                onChange({ ...step, assignedTeam: e.target.value })
              }
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              {TEAM_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Prioridad</Label>
            <select
              value={step.priority}
              onChange={(e) =>
                onChange({ ...step, priority: e.target.value })
              }
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
            >
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Offset (días vs inicio)</Label>
            <Input
              type="number"
              value={step.dueDateOffsetDays}
              onChange={(e) =>
                onChange({
                  ...step,
                  dueDateOffsetDays: Number.parseInt(e.target.value, 10) || 0,
                })
              }
              className="text-sm"
            />
          </div>
          <div className="self-end">
            <p className="text-xs text-muted-foreground">
              Vence: {dueDate ? fmtDate(dueDate) : "—"}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
