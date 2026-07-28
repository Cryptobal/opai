"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Sparkles, TicketPlus } from "lucide-react";
import { toast } from "sonner";
import { TaskTimePicker } from "@/components/agenda/TaskTimePicker";
import { TaskDatePicker } from "@/components/agenda/TaskDatePicker";
import { SimpleSelect } from "@/components/ui/simple-select";
import { useCorreoWork } from "./CorreoWorkContext";

type User = { id: string; name: string | null; email: string | null };
type Created = { id: string; code: string; title: string; status: string };
const PRIORITIES = [
  { key: "p1", label: "P1 · Crítico" },
  { key: "p2", label: "P2 · Alto" },
  { key: "p3", label: "P3 · Normal" },
  { key: "p4", label: "P4 · Bajo" },
];

/**
 * Sección Ticket del Panel de trabajo (Bloque 6): "✦ Crear ticket con IA"
 * propone {título, prioridad, equipo, vencimiento}; el usuario edita responsable
 * y vence, y confirma. Crea con source "email" y queda vinculado al hilo. La UI
 * sólo confirma con ok:true y muestra el ticket creado (verdad verificada).
 */
export function CorreoTicketPanel({ threadId, subject }: { threadId: string; subject: string }) {
  const { reload } = useCorreoWork();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"sug" | "create" | null>(null);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("p3");
  const [assignedTeam, setAssignedTeam] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [due, setDue] = useState("");
  const [time, setTime] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [created, setCreated] = useState<Created | null>(null);

  useEffect(() => {
    fetch("/api/crm/users")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setUsers(d?.data?.users ?? []))
      .catch(() => setUsers([]));
  }, []);

  async function suggest() {
    setBusy("sug");
    setOpen(true);
    try {
      const d = await fetch(`/api/crm/correos/${threadId}/ticket-suggest`, { method: "POST" }).then((r) => r.json());
      setTitle(d.title || `Seguimiento: ${subject}`);
      if (d.priority) setPriority(d.priority);
      if (d.assignedTeam) setAssignedTeam(d.assignedTeam);
      if (typeof d.dueAtDays === "number") {
        const dt = new Date(Date.now() + d.dueAtDays * 86_400_000);
        setDue(dt.toISOString().slice(0, 10));
      }
    } catch {
      toast.error("La IA no pudo proponer el ticket");
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    const t = title.trim();
    if (!t) return;
    let dueAt: string | undefined;
    if (due) dueAt = new Date(`${due}T${time || "18:00"}`).toISOString();
    setBusy("create");
    try {
      const d = await fetch(`/api/crm/correos/${threadId}/ticket`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t, priority, assignedTeam: assignedTeam || null, assignedTo: assignedTo || null, dueAt }),
      }).then((r) => r.json());
      if (d.ok && d.ticket) {
        setCreated(d.ticket);
        setOpen(false);
        toast.success(`Ticket ${d.ticket.code} creado`);
        reload("links");
      } else {
        toast.error(d.error || "No se pudo crear el ticket");
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-ds-border-subtle bg-ds-surface-2 p-2.5">
      <div className="flex items-center gap-2">
        <TicketPlus className="h-4 w-4 text-tint-violet-fg" />
        <p className="text-[13px] font-semibold text-ds-text-1">Ticket</p>
      </div>

      {created && (
        <Link
          href="/ops/tickets"
          className="flex items-center gap-2 rounded-lg border border-status-ok-border bg-status-ok-soft px-3 py-2 text-[13px] text-status-ok-fg ds-tap"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            {created.code} · {created.title}
          </span>
        </Link>
      )}

      {!open ? (
        <button
          type="button"
          onClick={() => void suggest()}
          disabled={busy !== null}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-tint-violet text-[13px] font-medium text-tint-violet-fg ds-tap disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" /> {busy === "sug" ? "Proponiendo…" : "✦ Crear ticket con IA"}
        </button>
      ) : (
        <div className="space-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título del ticket"
            className="h-10 w-full rounded-lg border border-ds-border-default bg-ds-surface-1 px-2 text-[16px] text-ds-text-1 sm:text-[13px]"
          />
          <div className="flex flex-wrap gap-1.5">
            {PRIORITIES.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPriority(p.key)}
                aria-pressed={priority === p.key}
                className={`h-8 rounded-full px-3 text-[12px] ds-tap ${
                  priority === p.key ? "bg-primary text-primary-foreground" : "border border-ds-border-default text-ds-text-2"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              value={assignedTeam}
              onChange={(e) => setAssignedTeam(e.target.value)}
              placeholder="Equipo (opcional)"
              className="h-9 min-w-[8rem] flex-1 rounded-lg border border-ds-border-default bg-ds-surface-1 px-2 text-[16px] text-ds-text-1 sm:text-[13px]"
            />
            {users.length > 0 && (
              <SimpleSelect
                value={assignedTo}
                onValueChange={setAssignedTo}
                aria-label="Responsable"
                className="h-10 min-w-[8rem] flex-1 sm:h-9"
                options={[
                  { value: "", label: "Sin responsable" },
                  ...users.map((u) => ({
                    value: u.id,
                    label: u.name || u.email || u.id,
                  })),
                ]}
              />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TaskDatePicker
              value={due}
              onChange={setDue}
              ariaLabel="Vencimiento"
              menuAlign="center"
              className="min-w-[8rem] flex-1"
            />
            <TaskTimePicker value={time} onChange={setTime} ariaLabel="Hora de vencimiento" menuAlign="right" className="shrink-0" />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-9 flex-1 rounded-lg border border-ds-border-default text-[13px] text-ds-text-2 ds-tap"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void create()}
              disabled={busy !== null || !title.trim()}
              className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary text-[13px] font-medium text-primary-foreground ds-tap disabled:opacity-50"
            >
              <TicketPlus className="h-4 w-4" /> {busy === "create" ? "Creando…" : "Crear ticket"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
