"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toZonedTime } from "date-fns-tz";
import {
  CheckCircle2,
  ExternalLink,
  MapPin,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar, Surface, Tag } from "@/components/opai-ds";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CHILE_TZ } from "@/lib/dates-cl";
import { dateAtChileSlot, formatAgendaTime } from "./agenda-calendar-utils";
import { TaskTimePicker } from "./TaskTimePicker";
import { TaskAssigneePicker } from "./TaskAssigneePicker";
import type { AgendaCalendarItem, AgendaTeamMember } from "./agenda-calendar.types";

type Props = {
  item: AgendaCalendarItem | null;
  users: AgendaTeamMember[];
  onClose: () => void;
  onChanged: () => void;
};

type InspectorParticipant = {
  name: string;
  responseStatus: string;
  hasGoogle: boolean;
};

/** Badge RSVP: ✓ Va / ✗ No va / ? pendiente / ◉ OPAI (sin Google). */
function RsvpBadge({ participant }: { participant: InspectorParticipant }) {
  if (!participant.hasGoogle) {
    return <Tag size="sm" variant="neutral">◉ OPAI</Tag>;
  }
  if (participant.responseStatus === "accepted") {
    return <Tag size="sm" variant="ok">✓ Va</Tag>;
  }
  if (participant.responseStatus === "declined") {
    return <Tag size="sm" variant="danger">✗ No va</Tag>;
  }
  return <Tag size="sm" variant="neutral">?</Tag>;
}

function localParts(iso: string): { date: string; time: string } {
  const d = toZonedTime(new Date(iso), CHILE_TZ);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export function AgendaInspector({ item, users, onClose, onChanged }: Props) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [visitDetail, setVisitDetail] = useState<{
    notes: string | null;
    address: string | null;
    htmlLink: string | null;
    syncStatus: string;
    participants: InspectorParticipant[];
  } | null>(null);

  useEffect(() => {
    if (!item) return;
    const parts = localParts(item.start);
    setDate(parts.date);
    setTime(item.allDay ? "" : parts.time);
    setAssignedUserId(item.assignedUserId ?? "");
    setAssigneeIds(
      item.assignedUserIds?.length
        ? item.assignedUserIds
        : item.assignedUserId
          ? [item.assignedUserId]
          : [],
    );
    setVisitDetail(null);

    if (item.source === "agenda_visita") {
      fetch(`/api/agenda/visitas/${item.id}`)
        .then((r) => r.json())
        .then((data) => {
          setVisitDetail({
            notes: data.visita?.notes ?? null,
            address:
              data.visita?.installation?.address ??
              data.visita?.customAddress ??
              null,
            htmlLink: data.htmlLink ?? null,
            syncStatus: data.syncStatus ?? "PENDING",
            // RSVP v2 (participantes) solo si el espejo CalendarEvent existe.
            participants: Array.isArray(data.v2?.participants)
              ? data.v2.participants.map(
                  (p: { name?: string; responseStatus?: string; hasGoogle?: boolean }) => ({
                    name: p.name ?? "—",
                    responseStatus: p.responseStatus ?? "needs_action",
                    hasGoogle: p.hasGoogle === true,
                  }),
                )
              : [],
          });
        })
        .catch(() => setVisitDetail(null));
    }
  }, [item]);

  if (!item) return null;

  const assignee =
    users.find((user) => user.id === assignedUserId)?.name ?? item.assignedName;

  async function saveTask(body: Record<string, unknown>, okMsg: string) {
    setBusy(true);
    try {
      const r = await fetch(`/api/crm/tasks/${item!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error();
      toast.success(okMsg);
      onChanged();
    } catch {
      toast.error("No se pudo actualizar la tarea");
    } finally {
      setBusy(false);
    }
  }

  async function saveVisit(body: Record<string, unknown>, okMsg: string) {
    setBusy(true);
    try {
      const r = await fetch(`/api/agenda/visitas/${item!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error();
      const data = (await r.json().catch(() => ({}))) as { sync?: { syncStatus?: string } };
      toast.success(
        data.sync?.syncStatus === "SYNCED" && body.startAt
          ? `${okMsg} · Google Calendar actualizado`
          : okMsg,
      );
      onChanged();
    } catch {
      toast.error("No se pudo actualizar la visita");
    } finally {
      setBusy(false);
    }
  }

  const saveSchedule = () => {
    if (!date) return;
    const allDay = !time;
    const [hour, minute] = (time || "09:00").split(":").map(Number);
    const start = dateAtChileSlot(date, hour * 60 + minute);
    const durationMs = Math.max(
      30 * 60_000,
      new Date(item.end).getTime() - new Date(item.start).getTime(),
    );
    const end = new Date(start.getTime() + durationMs);

    if (item.source === "tarea") {
      void saveTask(
        {
          dueAt: start.toISOString(),
          allDay,
          assigneeIds,
        },
        "Tarea actualizada",
      );
      return;
    }
    if (item.source === "agenda_visita") {
      void saveVisit(
        {
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          assignedUserId: assignedUserId || undefined,
        },
        "Visita actualizada",
      );
    }
  };

  const inputClass =
    "h-10 w-full rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] text-ds-text-1 sm:h-9";
  const calendarLink = item.htmlLink ?? visitDetail?.htmlLink;

  return (
    <Surface
      elevation={2}
      padding="md"
      className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <Tag size="sm" variant="neutral">
            {item.source === "tarea"
              ? "Tarea"
              : item.source === "google"
                ? "Google Calendar"
                : item.type}
          </Tag>
          <h2 className="font-display text-base font-semibold text-ds-text-1">{item.title}</h2>
          <p className="text-[13px] text-ds-text-3">
            {item.allDay
              ? "Todo el día"
              : `${formatAgendaTime(new Date(item.start))} – ${formatAgendaTime(new Date(item.end))}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar inspector"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-ds-text-3 ds-tap sm:h-9 sm:w-9"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {(item.accountName || item.installationName) && (
        <div className="space-y-1 text-[13px] text-ds-text-2">
          {item.accountName && <p>{item.accountName}</p>}
          {item.installationName && <p className="text-ds-text-3">{item.installationName}</p>}
        </div>
      )}

      {visitDetail?.address && (
        <div className="flex items-start gap-2 rounded-xl border border-ds-border-subtle bg-ds-surface-2 px-3 py-2 text-[13px] text-ds-text-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ds-text-4" />
          <span>{visitDetail.address}</span>
        </div>
      )}

      {(item.source === "tarea" || item.source === "agenda_visita") && (
        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Fecha"
              className={inputClass}
            />
            <TaskTimePicker value={time} onChange={setTime} ariaLabel="Hora" />
          </div>

          {item.source === "tarea" ? (
            <div className="space-y-1.5">
              <span className="text-[12px] font-medium text-ds-text-4">Responsables</span>
              <TaskAssigneePicker users={users} value={assigneeIds} onChange={setAssigneeIds} />
            </div>
          ) : (
            <label className="block space-y-1.5">
              <span className="text-[12px] font-medium text-ds-text-4">Responsable</span>
              <div className="flex items-center gap-2">
                {assignee && <Avatar name={assignee} size="sm" variant="brand" />}
                <select
                  value={assignedUserId}
                  onChange={(e) => setAssignedUserId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Sin asignar</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </div>
            </label>
          )}

          <button
            type="button"
            disabled={busy || !date}
            onClick={saveSchedule}
            className="h-10 w-full rounded-xl bg-primary text-[13px] font-medium text-primary-foreground ds-tap disabled:opacity-50 sm:h-9"
          >
            Guardar cambios
          </button>
        </div>
      )}

      {visitDetail && visitDetail.participants.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[12px] font-medium text-ds-text-4">Participantes</p>
          <ul className="space-y-1">
            {visitDetail.participants.map((participant) => (
              <li key={participant.name} className="flex items-center gap-2">
                <Avatar name={participant.name} size="sm" className="h-6 w-6 text-[12px]" />
                <span className="min-w-0 flex-1 truncate text-[13px] text-ds-text-2">
                  {participant.name}
                </span>
                <RsvpBadge participant={participant} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {visitDetail?.notes && (
        <p className="rounded-xl bg-ds-surface-2 px-3 py-2 text-[13px] text-ds-text-2">
          {visitDetail.notes}
        </p>
      )}

      <div className="mt-auto flex flex-wrap gap-2 border-t border-ds-border-subtle pt-3">
        {item.href && (
          <Link
            href={item.href}
            className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-ds-border-default text-[13px] text-ds-text-2 ds-tap sm:h-9"
          >
            Abrir origen <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        )}

        {calendarLink && (
          <a
            href={calendarLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-ds-border-default text-[13px] text-ds-text-2 ds-tap sm:h-9"
          >
            Google Calendar <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}

        {item.source === "tarea" && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveTask({ status: "done" }, "Tarea completada")}
              className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-status-ok-border bg-status-ok-soft text-[13px] text-status-ok-fg ds-tap sm:h-9"
            >
              <CheckCircle2 className="h-4 w-4" /> Completar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const r = await fetch(`/api/crm/tasks/${item.id}`, { method: "DELETE" }).catch(
                  () => null,
                );
                setBusy(false);
                if (r?.ok) {
                  toast.success("Tarea eliminada");
                  onChanged();
                  onClose();
                } else toast.error("No se pudo eliminar");
              }}
              aria-label="Eliminar tarea"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-ds-border-default text-ds-text-3 ds-tap sm:h-9 sm:w-9"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </>
        )}

        {item.source === "agenda_visita" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmCancel(true)}
            className="inline-flex h-10 flex-1 items-center justify-center rounded-xl border border-status-danger-border text-[13px] text-status-danger-fg ds-tap sm:h-9"
          >
            Cancelar visita
          </button>
        )}
      </div>

      <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Cancelar esta visita?</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-ds-text-3">
            Se avisará a los participantes y el evento se quitará de Google Calendar.
          </p>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setConfirmCancel(false)}
              className="h-11 flex-1 rounded-xl border border-ds-border-default text-[13px] font-medium ds-tap sm:h-9"
            >
              Volver
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setConfirmCancel(false);
                void saveVisit({ action: "cancel" }, "Visita cancelada");
                onClose();
              }}
              className="h-11 flex-1 rounded-xl bg-status-danger-soft text-[13px] font-semibold text-status-danger-fg ds-tap sm:h-9"
            >
              Cancelar visita
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </Surface>
  );
}
