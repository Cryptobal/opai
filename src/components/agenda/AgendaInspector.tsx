"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toZonedTime } from "date-fns-tz";
import {
  ExternalLink,
  MapPin,
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
import type { InvitedVia } from "@/modules/calendar/calendar-detail";
import { dateAtChileSlot, formatAgendaTime } from "./agenda-calendar-utils";
import { RsvpBadge } from "./RsvpBadge";
import { TaskTimePicker } from "./TaskTimePicker";
import { EditEventDialog } from "./evento/EditEventDialog";
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
  invitedVia: InvitedVia;
};

const TYPE_LABELS: Record<string, string> = {
  cliente: "Cliente",
  supervision: "Supervisión",
  tecnica: "Visita técnica",
  otra: "Evento",
  licitacion: "Licitación",
  google: "Google Calendar",
  tarea: "Tarea",
};

function inspectorTypeLabel(item: AgendaCalendarItem): string {
  const label = item.label?.trim();
  if (label) return label;
  return TYPE_LABELS[item.type] ?? "Evento";
}

function localParts(iso: string): { date: string; time: string } {
  const d = toZonedTime(new Date(iso), CHILE_TZ);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/** True si fecha/hora/responsable/allDay difieren del item cargado. */
export function isInspectorScheduleDirty(
  item: Pick<AgendaCalendarItem, "start" | "allDay" | "assignedUserId">,
  draft: { date: string; time: string; assignedUserId: string; allDay?: boolean },
): boolean {
  const parts = localParts(item.start);
  const baselineTime = item.allDay ? "" : parts.time;
  const itemAllDay = item.allDay === true;
  // Si el draft omite allDay, asumir el del item (tests / callers parciales).
  const draftAllDay = draft.allDay === undefined ? itemAllDay : draft.allDay === true;
  return (
    draft.date !== parts.date ||
    draftAllDay !== itemAllDay ||
    (!draftAllDay && draft.time !== baselineTime) ||
    draft.assignedUserId !== (item.assignedUserId ?? "")
  );
}

/**
 * Inspector lateral para visitas, licitaciones y eventos de Google.
 * Las tareas se editan exclusivamente en `TareaDetailSheet` (AgendaTaskDetail).
 */
export function AgendaInspector({ item, users, onClose, onChanged }: Props) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [assignedUserId, setAssignedUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmResync, setConfirmResync] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [visitDetail, setVisitDetail] = useState<{
    notes: string | null;
    address: string | null;
    htmlLink: string | null;
    syncStatus: string | null;
    syncReason?: string | null;
    participants: InspectorParticipant[];
  } | null>(null);

  useEffect(() => {
    if (!item) return;
    const parts = localParts(item.start);
    setDate(parts.date);
    setAllDay(Boolean(item.allDay));
    setTime(item.allDay ? "" : parts.time);
    setAssignedUserId(item.assignedUserId ?? "");
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
            syncStatus: data.syncStatus ?? null,
            syncReason: data.syncReason ?? null,
            participants: Array.isArray(data.v2?.participants)
              ? data.v2.participants.map(
                  (p: {
                    name?: string;
                    responseStatus?: string;
                    hasGoogle?: boolean;
                    invitedVia?: InvitedVia;
                  }) => ({
                    name: p.name ?? "—",
                    responseStatus: p.responseStatus ?? "needs_action",
                    // Retrocompat: APIs viejas solo mandaban hasGoogle.
                    invitedVia:
                      p.invitedVia ??
                      (p.hasGoogle === true ? "google_account" : "none"),
                  }),
                )
              : [],
          });
        })
        .catch(() => setVisitDetail(null));
    } else if (item.source === "licitacion") {
      setVisitDetail({
        notes: null,
        address: null,
        htmlLink: item.htmlLink ?? null,
        syncStatus: item.syncStatus ?? null,
        syncReason: item.syncReason ?? null,
        participants: [],
      });
    }
  }, [item]);

  if (!item) return null;

  const assignee =
    users.find((user) => user.id === assignedUserId)?.name ?? item.assignedName;
  const scheduleDirty = isInspectorScheduleDirty(item, {
    date,
    time,
    assignedUserId,
    allDay,
  });

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
    if (item.source === "licitacion") {
      const dealId = item.dealId ?? item.spanKey;
      if (!dealId) {
        toast.error("No se encontró el negocio de la licitación");
        return;
      }
      setBusy(true);
      fetch(`/api/crm/deals/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fechaEntrega: date }),
      })
        .then(async (r) => {
          if (!r.ok) throw new Error();
          toast.success("Fecha de entrega actualizada");
          onChanged();
        })
        .catch(() => toast.error("No se pudo actualizar la entrega"))
        .finally(() => setBusy(false));
      return;
    }
    if (item.source !== "agenda_visita") return;
    if (allDay) {
      const start = dateAtChileSlot(date, 0);
      const end = dateAtChileSlot(date, 24 * 60 - 1);
      void saveVisit(
        {
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          allDay: true,
          assignedUserId: assignedUserId || undefined,
        },
        "Visita actualizada",
      );
      return;
    }
    const [hour, minute] = (time || "09:00").split(":").map(Number);
    const start = dateAtChileSlot(date, hour * 60 + minute);
    const durationMs = Math.max(
      30 * 60_000,
      new Date(item.end).getTime() - new Date(item.start).getTime(),
    );
    const end = new Date(start.getTime() + durationMs);
    void saveVisit(
      {
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        allDay: false,
        assignedUserId: assignedUserId || undefined,
      },
      "Visita actualizada",
    );
  };

  const resyncToGoogle = () => {
    setBusy(true);
    fetch(`/api/calendar/events/${item.id}/resync`, { method: "POST" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || "Error");
        if (j.syncStatus === "SYNCED") {
          toast.success("Reenviado a Google Calendar");
        } else {
          toast.error(j.syncReason || "No se pudo sincronizar completamente");
        }
        onChanged();
      })
      .catch((e) =>
        toast.error(e instanceof Error ? e.message : "No se pudo reenviar"),
      )
      .finally(() => {
        setBusy(false);
        setConfirmResync(false);
      });
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
            {item.source === "google"
              ? "Google Calendar"
              : item.source === "licitacion"
                ? "Licitación"
                : inspectorTypeLabel(item)}
          </Tag>
          <h2 className="font-display text-base font-semibold text-ds-text-1">
            {item.source === "licitacion"
              ? item.accountName
                ? item.title.replace(/^ENTREGA · |^Licitación · /, "").replace(/ · entrega .*$/, "")
                : item.title.replace(/^ENTREGA · /, "")
              : item.title}
          </h2>
          <p className="text-[13px] text-ds-text-3">
            {item.source === "licitacion"
              ? `Entrega: ${date || "—"}`
              : allDay || item.allDay
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

      {item.source === "google" && (
        <p className="rounded-xl border border-ds-border-subtle bg-ds-surface-2 px-3 py-2 text-[13px] text-ds-text-2">
          Evento de Google Calendar: se edita desde Google.
          {calendarLink ? (
            <>
              {" "}
              <a
                href={calendarLink}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                Abrir en Google
              </a>
            </>
          ) : null}
        </p>
      )}

      {(item.source === "agenda_visita" || item.source === "licitacion") && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2">
            <label className="block space-y-1.5">
              <span className="text-[12px] font-medium text-ds-text-4">
                {item.source === "licitacion" ? "Fecha de entrega" : "Fecha"}
              </span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-label={item.source === "licitacion" ? "Fecha de entrega" : "Fecha"}
                className={inputClass}
              />
            </label>
            {item.source === "agenda_visita" && (
              <>
                <label className="flex min-h-11 items-center gap-2 text-[13px] text-ds-text-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={allDay}
                    onChange={(e) => {
                      setAllDay(e.target.checked);
                      if (e.target.checked) setTime("");
                    }}
                  />
                  Todo el día
                </label>
                {!allDay && (
                  <TaskTimePicker value={time} onChange={setTime} ariaLabel="Hora" />
                )}
              </>
            )}
          </div>

          {item.source === "agenda_visita" && (
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

          {(visitDetail?.syncStatus || item.syncStatus) && (
            <p className="text-[12px] text-ds-text-3">
              Sync: {visitDetail?.syncStatus ?? item.syncStatus}
              {(visitDetail?.syncReason || item.syncReason)
                ? ` · ${visitDetail?.syncReason ?? item.syncReason}`
                : ""}
            </p>
          )}

          <button
            type="button"
            disabled={busy || !date || !scheduleDirty}
            onClick={saveSchedule}
            className="h-10 w-full rounded-xl bg-primary text-[13px] font-medium text-primary-foreground ds-tap disabled:opacity-50 sm:h-9"
          >
            Guardar cambios
          </button>

          {item.source === "agenda_visita" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmResync(true)}
              className="h-10 w-full rounded-xl border border-ds-border-default text-[13px] text-ds-text-2 ds-tap disabled:opacity-50 sm:h-9"
            >
              Reenviar a Google
            </button>
          )}
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
        {item.source === "agenda_visita" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setEditOpen(true)}
            className="inline-flex h-10 flex-1 items-center justify-center rounded-xl border border-ds-border-default text-[13px] text-ds-text-2 ds-tap sm:h-9"
          >
            Editar
          </button>
        )}

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

      <Dialog open={confirmResync} onOpenChange={setConfirmResync}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Reenviar a Google Calendar?</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-ds-text-3">
            Puede reenviar invitaciones a los asistentes. El evento no se borra.
          </p>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setConfirmResync(false)}
              className="h-11 flex-1 rounded-xl border border-ds-border-default text-[13px] font-medium ds-tap sm:h-9"
            >
              Volver
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={resyncToGoogle}
              className="h-11 flex-1 rounded-xl bg-primary text-[13px] font-semibold text-primary-foreground ds-tap sm:h-9"
            >
              Reenviar
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <EditEventDialog
        eventId={item.source === "agenda_visita" ? item.id : null}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={() => {
          onChanged();
          setEditOpen(false);
        }}
      />
    </Surface>
  );
}
