"use client";

import { DatePickerField } from "@/components/ui/date-picker";

import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { todayInChile, ymdInChile, addDaysChile } from "@/lib/dates-cl";
import { dueFromYmd, DEFAULT_MINUTE, type DueValue } from "@/components/tareas/TareaDatePopover";
import type { ThreadTaskSource } from "@/modules/crm/email/correos-tasks";

type Props = {
  threadId: string;
  source: ThreadTaskSource;
  initialTitle?: string;
  onDone: () => void;
  onCancel: () => void;
};

function chipCls(on: boolean) {
  return cn(
    "opai-glass-soft inline-flex min-h-10 items-center rounded-2xl px-2.5 text-[13px] ds-tap",
    on ? "border-primary/50 bg-primary/15 text-primary" : "text-ds-text-2",
  );
}

/** Mini-form inline: título + Hoy/Mañana/Fecha → POST crear tarea. */
export function CorreoTasksStripForm({
  threadId,
  source,
  initialTitle = "",
  onDone,
  onCancel,
}: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [due, setDue] = useState<DueValue>({ dueAt: null, allDay: true });
  const [busy, setBusy] = useState(false);

  const today = todayInChile();
  const tomorrow = ymdInChile(addDaysChile(new Date(), 1));
  const dueYmd = due.dueAt ? ymdInChile(new Date(due.dueAt)) : null;

  async function submit() {
    const t = title.trim();
    if (!t) {
      toast.error("Escribí un título");
      return;
    }
    setBusy(true);
    try {
      const d = await fetch(`/api/crm/correos/${threadId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: t,
          dueAt: due.dueAt ?? undefined,
          allDay: due.allDay,
          source,
        }),
      }).then((r) => r.json());
      if (d.task) {
        toast.success("Tarea creada");
        onDone();
      } else {
        toast.error(d.error || "No se pudo crear la tarea");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-ds-border-subtle bg-ds-surface-2 p-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Título de la tarea…"
        autoFocus
        className="h-10 rounded-lg border border-ds-border-default bg-ds-surface-1 px-2.5 text-[13px] text-ds-text-1 sm:h-9"
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
          if (e.key === "Escape") onCancel();
        }}
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={chipCls(dueYmd === today)} onClick={() => setDue(dueFromYmd(today, DEFAULT_MINUTE, true))}>
          Hoy
        </button>
        <button type="button" className={chipCls(dueYmd === tomorrow)} onClick={() => setDue(dueFromYmd(tomorrow, DEFAULT_MINUTE, true))}>
          Mañana
        </button>
        <label className={chipCls(Boolean(dueYmd && dueYmd !== today && dueYmd !== tomorrow))}>
          Fecha
          <DatePickerField
            value={dueYmd && dueYmd !== today && dueYmd !== tomorrow ? dueYmd : null}
            onChange={(ymd) => {
              if (ymd) setDue(dueFromYmd(ymd, DEFAULT_MINUTE, true));
            }}
            triggerClassName="sr-only"
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="ml-auto inline-flex h-10 items-center rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-foreground ds-tap disabled:opacity-50 sm:h-9"
        >
          {busy ? "…" : "Crear"}
        </button>
        <button type="button" onClick={onCancel} className="text-[12px] text-ds-text-3 ds-tap">
          Cancelar
        </button>
      </div>
    </div>
  );
}
