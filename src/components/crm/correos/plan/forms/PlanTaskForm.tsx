"use client";

import { DatePickerField } from "@/components/ui/date-picker";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { PlanTaskOverride } from "@/modules/crm/email/email-to-crm-structure.types";

type Props = {
  task: PlanTaskOverride;
  onChange: (partial: Partial<PlanTaskOverride>) => void;
};

export function PlanTaskForm({ task, onChange }: Props) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="task-title" className="text-[12px] text-ds-text-3">
          Título de la tarea
        </Label>
        <Input
          id="task-title"
          value={task.title ?? ""}
          placeholder="Seguimiento cotización"
          onChange={(e) => onChange({ title: e.target.value || undefined })}
          className="h-10 text-[13px] sm:h-9"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="task-due" className="text-[12px] text-ds-text-3">
            Fecha límite
          </Label>
          <DatePickerField
            value={task.dueAt ? task.dueAt.slice(0, 10) : null}
            onChange={(ymd) => onChange({ dueAt: ymd })}
            id="task-due"
            triggerClassName="h-10 text-[13px] sm:h-9"
          />
        </div>
        <div className="flex items-end pb-0.5">
          <div className="flex items-center gap-2">
            <Checkbox
              id="task-allday"
              checked={task.allDay ?? true}
              onCheckedChange={(v) => onChange({ allDay: Boolean(v) })}
              className="h-5 w-5"
            />
            <Label htmlFor="task-allday" className="cursor-pointer text-[13px] text-ds-text-2">
              Todo el día
            </Label>
          </div>
        </div>
      </div>
      <p className="text-[12px] text-ds-text-4">
        Asignación de responsables disponible desde la vista del negocio.
      </p>
    </div>
  );
}
