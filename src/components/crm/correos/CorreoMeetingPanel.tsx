"use client";

import { useState } from "react";
import { CalendarCheck, CalendarPlus, Mail, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { TaskTimePicker } from "@/components/agenda/TaskTimePicker";
import { SimpleSelect } from "@/components/ui/simple-select";

type Created = { id: string; title: string; startAt: string };

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * Tab Reunión del Panel de trabajo (Bloque 7): "Proponer reunión con IA"
 * propone {título, fecha/hora, asistentes} desde el hilo; el usuario edita y
 * agenda. Crea un CalendarEvent vinculado al hilo (calendar_event). La card
 * muestra "Correo asociado: {asunto}". Verdad verificada: sólo ok:true confirma.
 */
export function CorreoMeetingPanel({ threadId, subject }: { threadId: string; subject: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"sug" | "create" | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [durationMin, setDurationMin] = useState(30);
  const [attendees, setAttendees] = useState<string[]>([]);
  const [newAttendee, setNewAttendee] = useState("");
  const [created, setCreated] = useState<Created | null>(null);

  async function suggest() {
    setBusy("sug");
    setOpen(true);
    try {
      const d = await fetch(`/api/crm/correos/${threadId}/meeting-suggest`, { method: "POST" }).then((r) => r.json());
      setTitle(d.title || `Reunión: ${subject}`);
      if (d.startAt) {
        const dt = new Date(d.startAt);
        setDate(dt.toISOString().slice(0, 10));
        setTime(dt.toTimeString().slice(0, 5));
      }
      if (typeof d.durationMin === "number") setDurationMin(d.durationMin);
      if (Array.isArray(d.attendeeEmails)) setAttendees(d.attendeeEmails);
    } catch {
      toast.error("La IA no pudo proponer la reunión");
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    const t = title.trim();
    if (!t || !date) {
      toast.error("Título y fecha son requeridos");
      return;
    }
    const startAt = new Date(`${date}T${time || "10:00"}`).toISOString();
    setBusy("create");
    try {
      const d = await fetch(`/api/crm/correos/${threadId}/meeting`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t, startAt, durationMin, attendeeEmails: attendees }),
      }).then((r) => r.json());
      if (d.ok && d.event) {
        setCreated(d.event);
        setOpen(false);
        toast.success("Reunión agendada");
      } else {
        toast.error(d.error || "No se pudo agendar la reunión");
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-ds-border-subtle bg-ds-surface-2 p-2.5">
      <div className="flex items-center gap-2">
        <CalendarPlus className="h-4 w-4 text-tint-violet-fg" />
        <p className="text-[13px] font-semibold text-ds-text-1">Reunión</p>
      </div>

      {created && (
        <div className="space-y-1 rounded-lg border border-status-ok-border bg-status-ok-soft p-2.5 text-[13px] text-status-ok-fg">
          <div className="flex items-center gap-1.5 font-medium">
            <CalendarCheck className="h-4 w-4 shrink-0" /> {created.title}
          </div>
          <p className="text-[12px]">{fmtDateTime(created.startAt)}</p>
          <p className="flex items-center gap-1 text-[12px]">
            <Mail className="h-3.5 w-3.5 shrink-0" /> Correo asociado: {subject}
          </p>
        </div>
      )}

      {!open ? (
        <button
          type="button"
          onClick={() => void suggest()}
          disabled={busy !== null}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-tint-violet text-[13px] font-medium text-tint-violet-fg ds-tap disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" /> {busy === "sug" ? "Proponiendo…" : "Proponer reunión con IA"}
        </button>
      ) : (
        <div className="space-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título de la reunión"
            className="h-10 w-full rounded-lg border border-ds-border-default bg-ds-surface-1 px-2 text-[16px] text-ds-text-1 sm:text-[13px]"
          />
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Fecha"
              className="h-9 min-w-[8rem] flex-1 rounded-lg border border-ds-border-default bg-ds-surface-1 px-2 text-[13px] text-ds-text-1"
            />
            <TaskTimePicker value={time} onChange={setTime} ariaLabel="Hora" menuAlign="right" className="shrink-0" />
            <SimpleSelect
              value={String(durationMin)}
              onValueChange={(v) => setDurationMin(Number(v))}
              aria-label="Duración"
              className="h-10 w-[6.5rem] sm:h-9"
              options={[
                { value: "30", label: "30 min" },
                { value: "60", label: "60 min" },
              ]}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {attendees.map((a) => (
              <span key={a} className="inline-flex items-center gap-1 rounded-full border border-ds-border-default bg-ds-surface-1 px-2 py-1 text-[12px] text-ds-text-2">
                {a}
                <button type="button" aria-label={`Quitar ${a}`} onClick={() => setAttendees((p) => p.filter((x) => x !== a))} className="ds-tap">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={newAttendee}
              onChange={(e) => setNewAttendee(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newAttendee.includes("@")) {
                  setAttendees((p) => Array.from(new Set([...p, newAttendee.trim().toLowerCase()])));
                  setNewAttendee("");
                }
              }}
              placeholder="Agregar asistente (email) + Enter"
              className="h-9 min-w-0 flex-1 rounded-lg border border-ds-border-default bg-ds-surface-1 px-2 text-[16px] text-ds-text-1 sm:text-[13px]"
            />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setOpen(false)} className="h-9 flex-1 rounded-lg border border-ds-border-default text-[13px] text-ds-text-2 ds-tap">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void create()}
              disabled={busy !== null || !title.trim() || !date}
              className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary text-[13px] font-medium text-primary-foreground ds-tap disabled:opacity-50"
            >
              <CalendarPlus className="h-4 w-4" /> {busy === "create" ? "Agendando…" : "Agendar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
