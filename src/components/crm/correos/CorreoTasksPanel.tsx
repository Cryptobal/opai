"use client";

import { useEffect, useState } from "react";
import { CheckSquare, ListTodo, Plus, Sparkles, Square } from "lucide-react";
import { toast } from "sonner";

type Task = { id: string; title: string; status: string; dueAt: string | null; allDay: boolean };

function fmtDue(iso: string | null, allDay: boolean): string {
  if (!iso) return "";
  const d = new Date(iso);
  const day = d.toLocaleDateString("es-CL", { day: "2-digit", month: "short" });
  if (allDay) return day;
  return `${day} ${d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}`;
}

/**
 * Tareas del correo: convierte un hilo en acción con dueño (quien la crea) y
 * fecha. La tarea hereda la asociación (cuenta/negocio/contacto) del hilo y, con
 * fecha, dispara el recordatorio por Slack del cron existente.
 */
export function CorreoTasksPanel({ threadId, subject }: { threadId: string; subject: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState<"add" | "sug" | null>(null);

  useEffect(() => {
    fetch(`/api/crm/correos/${threadId}/tasks`)
      .then((r) => r.json())
      .then((d) => setTasks(d.tasks ?? []))
      .catch(() => undefined);
  }, [threadId]);

  async function add() {
    const t = title.trim() || `Seguimiento: ${subject}`;
    // Sin fecha → tarea sin agenda. Con fecha y hora → aviso a esa hora. Con
    // fecha sin hora → todo el día (aviso a media mañana). El ISO se arma en la
    // zona del navegador (la del usuario) para no desfasar el recordatorio.
    let dueAt: string | undefined;
    let allDay = false;
    if (due) {
      allDay = !time;
      dueAt = new Date(`${due}T${time || "09:00"}`).toISOString();
    }
    setBusy("add");
    try {
      const d = await fetch(`/api/crm/correos/${threadId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t, dueAt, allDay }),
      }).then((r) => r.json());
      if (d.task) {
        setTasks((p) => [d.task, ...p]);
        setTitle("");
        setDue("");
        setTime("");
        toast.success("Tarea agendada");
      } else {
        toast.error(d.error || "No se pudo crear la tarea");
      }
    } finally {
      setBusy(null);
    }
  }

  async function suggest() {
    setBusy("sug");
    try {
      const d = await fetch(`/api/crm/correos/${threadId}/tasks/suggest`, { method: "POST" }).then((r) => r.json());
      if (d.title) setTitle(d.title);
    } finally {
      setBusy(null);
    }
  }

  async function toggle(task: Task) {
    const next = task.status === "done" ? "open" : "done";
    setTasks((p) => p.map((x) => (x.id === task.id ? { ...x, status: next } : x)));
    await fetch(`/api/crm/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    }).catch(() => undefined);
  }

  return (
    <div className="space-y-2 rounded-xl border border-ds-border-subtle bg-ds-surface-2 p-2.5">
      <div className="flex items-center gap-2">
        <ListTodo className="h-4 w-4 text-tint-violet-fg" />
        <p className="text-[13px] font-semibold text-ds-text-1">Tareas</p>
      </div>

      {tasks.length > 0 && (
        <ul className="space-y-1">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-center gap-2 text-[13px]">
              <button type="button" onClick={() => void toggle(t)} className="shrink-0 text-ds-text-3 ds-tap" aria-label="Completar">
                {t.status === "done" ? (
                  <CheckSquare className="h-4 w-4 text-status-ok-fg" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
              </button>
              <span className={`min-w-0 flex-1 truncate ${t.status === "done" ? "text-ds-text-4 line-through" : "text-ds-text-1"}`}>
                {t.title}
              </span>
              {t.dueAt && <span className="shrink-0 text-[12px] text-ds-text-4">{fmtDue(t.dueAt, t.allDay)}</span>}
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Nueva tarea (o Sugerir)…"
          className="h-9 min-w-0 flex-1 rounded-lg border border-ds-border-default bg-ds-surface-1 px-2 text-[13px] text-ds-text-1"
        />
        <button
          type="button"
          onClick={() => void suggest()}
          disabled={busy !== null}
          title="Sugerir el próximo paso con IA"
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-ds-border-default px-2 text-[12px] ds-tap disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" /> {busy === "sug" ? "…" : "Sugerir"}
        </button>
      </div>
      <div className="flex gap-2">
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          aria-label="Fecha"
          className="h-9 min-w-0 flex-1 rounded-lg border border-ds-border-default bg-ds-surface-1 px-2 text-[13px] text-ds-text-1"
        />
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          aria-label="Hora de aviso (opcional)"
          disabled={!due}
          className="h-9 w-24 shrink-0 rounded-lg border border-ds-border-default bg-ds-surface-1 px-2 text-[13px] text-ds-text-1 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => void add()}
          disabled={busy !== null}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13px] font-medium text-primary-foreground ds-tap disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> {busy === "add" ? "Agendando…" : "Agendar"}
        </button>
      </div>
      {due && !time && (
        <p className="text-[12px] text-ds-text-4">Sin hora → tarea de todo el día (aviso a media mañana).</p>
      )}
    </div>
  );
}
