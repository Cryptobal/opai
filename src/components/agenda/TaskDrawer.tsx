"use client";

import { DatePickerField } from "@/components/ui/date-picker";

import { useEffect, useState, type MouseEvent } from "react";
import Link from "next/link";
import { CheckCircle2, ExternalLink, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Surface } from "@/components/opai-ds";
import { TimeChipPicker } from "@/components/opai/TimeChipPicker";
import type { WeekItem } from "./agenda-calendar.types";

type Props = {
  task: WeekItem | null;
  onClose: () => void;
  onChanged: () => void;
};

/** Fecha/hora locales del ISO para precargar los inputs. */
function localParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/** Gestor de tarea desde la Agenda: reprogramar día/hora, completar, abrir origen. */
export function TaskDrawer({ task, onClose, onChanged }: Props) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!task) return;
    const p = localParts(task.start);
    setDate(p.date);
    setTime(task.allDay ? "" : p.time);
  }, [task]);

  if (!task) return null;

  async function patch(body: Record<string, unknown>, okMsg: string) {
    setBusy(true);
    try {
      const r = await fetch(`/api/crm/tasks/${task!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error();
      toast.success(okMsg);
      onChanged();
      onClose();
    } catch {
      toast.error("No se pudo actualizar la tarea");
    } finally {
      setBusy(false);
    }
  }

  const save = () => {
    if (!date) return;
    const allDay = !time;
    const dueAt = new Date(`${date}T${time || "09:00"}`).toISOString();
    void patch({ dueAt, allDay }, "Tarea reprogramada");
  };

  const moveDays = (n: number) => {
    const base = new Date(`${date}T${time || "09:00"}`);
    base.setDate(base.getDate() + n);
    const p = localParts(base.toISOString());
    setDate(p.date);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <Surface
        elevation={2}
        padding="md"
        className="w-full max-w-md space-y-3 rounded-t-2xl pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:rounded-2xl sm:pb-4"
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-mono uppercase tracking-[0.08em] text-primary">Tarea</p>
            <p className="text-[14px] font-semibold text-ds-text-1">{task.title}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="shrink-0 rounded-lg p-1.5 text-ds-text-3 ds-tap">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <DatePickerField value={date || null} onChange={(ymd) => setDate((ymd ?? ""))} aria-label={"Fecha"} triggerClassName={"h-11 min-w-0 flex-1 rounded-xl border border-ds-border-default bg-ds-surface-1 px-2 text-[13px] text-ds-text-1 sm:h-9"} />
          <TimeChipPicker value={time} onChange={setTime} menuAlign="right" />
        </div>
        <p className="text-[12px] text-ds-text-4">Sin hora → todo el día (aviso a media mañana).</p>

        <div className="flex flex-wrap gap-1.5">
          {[["+1 día", 1], ["+2 días", 2], ["Próx. semana", 7]].map(([label, n]) => (
            <button key={label as string} type="button" onClick={() => moveDays(n as number)}
              className="h-9 rounded-full bg-ds-surface-2 px-3 text-[12px] text-ds-text-2 ds-tap">
              {label}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button type="button" disabled={busy || !date} onClick={save}
            className="h-10 flex-1 rounded-xl bg-primary text-[13px] font-medium text-primary-foreground ds-tap disabled:opacity-50 sm:h-9">
            {busy ? "Guardando…" : "Guardar"}
          </button>
          <button type="button" disabled={busy} onClick={() => void patch({ status: "done" }, "Tarea completada")}
            aria-label="Completar"
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-status-ok-border bg-status-ok-soft px-3 text-[13px] text-status-ok-fg ds-tap disabled:opacity-50 sm:h-9">
            <CheckCircle2 className="h-4 w-4" /> Completar
          </button>
          <button type="button" disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await fetch(`/api/crm/tasks/${task.id}`, { method: "DELETE" }).catch(() => null);
              setBusy(false);
              if (r?.ok) { toast.success("Tarea eliminada"); onChanged(); onClose(); }
              else toast.error("No se pudo eliminar");
            }}
            aria-label="Eliminar"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-ds-border-default text-ds-text-3 ds-tap disabled:opacity-50 sm:h-9 sm:w-9">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        {task.href && (
          <Link href={task.href} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary ds-tap">
            Abrir origen (correo / negocio) <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        )}
      </Surface>
    </div>
  );
}
