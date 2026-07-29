"use client";

import { useEffect, useState } from "react";
import {
  CalendarDays,
  Check,
  ExternalLink,
  HelpCircle,
  Loader2,
  MapPin,
  Users,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { IconBubble, Surface, Tag } from "@/components/opai-ds";
import type { CorreoInviteDTO } from "@/modules/crm/email/correos.types";

type Rsvp = CorreoInviteDTO["responseStatus"];

function RsvpButton({
  label,
  icon: Icon,
  active,
  variant,
  disabled,
  onClick,
}: {
  label: string;
  icon: typeof Check;
  active: boolean;
  variant: "ok" | "warn" | "danger";
  disabled?: boolean;
  onClick: () => void;
}) {
  const activeCls =
    variant === "ok"
      ? "border-status-ok-border bg-status-ok-soft text-status-ok-fg"
      : variant === "warn"
        ? "border-status-warn-border bg-status-warn-soft text-status-warn-fg"
        : "border-status-danger-border bg-status-danger-soft text-status-danger-fg";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-10 min-w-[96px] flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 text-[13px] font-medium ds-tap transition-colors disabled:opacity-50 sm:flex-none ${
        active
          ? activeCls
          : "border-ds-border-default bg-ds-surface-1 text-ds-text-2 hover:bg-ds-surface-2"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </button>
  );
}

function statusLabel(status: Rsvp, cancelled: boolean): string {
  if (cancelled) return "Cancelada";
  if (status === "accepted") return "Vas a asistir";
  if (status === "tentative") return "Marcado como quizás";
  if (status === "declined") return "No vas a asistir";
  return "¿Asistirás?";
}

function statusVariant(status: Rsvp, cancelled: boolean): "ok" | "warn" | "danger" | "neutral" {
  if (cancelled) return "danger";
  if (status === "accepted") return "ok";
  if (status === "tentative") return "warn";
  if (status === "declined") return "danger";
  return "neutral";
}

/**
 * Card RSVP estilo Gmail. Lazy-load: consulta GET invite al montar/abrir.
 * No renderiza nada si el mensaje no trae invitación ICS.
 */
export function CorreoInviteRsvpCard({
  threadId,
  messageId,
}: {
  threadId: string;
  messageId: string;
}) {
  const [invite, setInvite] = useState<CorreoInviteDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setInvite(null);
    void fetch(
      `/api/crm/correos/${encodeURIComponent(threadId)}/invite?messageId=${encodeURIComponent(messageId)}`,
    )
      .then(async (r) => {
        if (r.status === 404) return null;
        const d = await r.json().catch(() => null);
        if (!r.ok || !d?.invite) return null;
        return d.invite as CorreoInviteDTO;
      })
      .then((inv) => {
        if (!cancelled) setInvite(inv);
      })
      .catch(() => {
        if (!cancelled) setInvite(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [threadId, messageId]);

  async function respond(response: Exclude<Rsvp, "needs_action">) {
    if (!invite || invite.cancelled || busy) return;
    if (!invite.calendarConnected) {
      toast.error("Conectá Google Calendar para responder la invitación");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/crm/correos/${encodeURIComponent(threadId)}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, response }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) {
        if (d.code === "calendar_disconnected") {
          toast.error("Google Calendar no conectado");
        } else if (d.code === "event_not_found") {
          toast.error(
            "El evento aún no está en tu Google Calendar. Revisá que la invitación haya llegado a esa cuenta.",
          );
        } else {
          toast.error(d.error || "No se pudo enviar la respuesta");
        }
        return;
      }
      setInvite((prev) =>
        prev
          ? {
              ...prev,
              responseStatus: d.responseStatus,
              googleEventId: d.googleEventId ?? prev.googleEventId,
              googleHtmlLink: d.googleHtmlLink ?? prev.googleHtmlLink,
            }
          : prev,
      );
      toast.success(
        response === "accepted"
          ? "Invitación aceptada"
          : response === "tentative"
            ? "Marcado como quizás"
            : "Invitación rechazada",
      );
    } finally {
      setBusy(false);
    }
  }

  // Sin flash: no mostramos nada hasta confirmar que hay invite ICS.
  if (loading || !invite) {
    return busy ? (
      <div className="mb-3 flex items-center gap-2 rounded-xl border border-ds-border-subtle bg-ds-surface-2 px-3 py-2.5 text-[12px] text-ds-text-4">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Enviando respuesta…
      </div>
    ) : null;
  }

  const status = invite.responseStatus;

  return (
    <Surface elevation={1} padding="md" className="mb-3 space-y-3">
      <div className="flex items-start gap-3">
        <IconBubble icon={CalendarDays} variant="brand" size="md" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-[15px] font-semibold leading-snug text-ds-text-1">
              {invite.title}
            </p>
            <Tag variant={statusVariant(status, invite.cancelled)} size="sm">
              {statusLabel(status, invite.cancelled)}
            </Tag>
          </div>
          {invite.whenLabel ? (
            <p className="text-[13px] text-ds-text-2">{invite.whenLabel}</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-1.5 rounded-xl border border-ds-border-subtle bg-ds-surface-2 px-3 py-2.5 text-[13px]">
        {(invite.organizerName || invite.organizerEmail) && (
          <div className="flex items-center gap-2 text-ds-text-2">
            <Users className="h-3.5 w-3.5 shrink-0 text-ds-text-4" />
            <span className="truncate">
              Organiza{" "}
              <span className="font-medium text-ds-text-1">
                {invite.organizerName || invite.organizerEmail}
              </span>
            </span>
          </div>
        )}
        {(invite.location || invite.joinUrl) && (
          <div className="flex items-center gap-2 text-ds-text-2">
            <Video className="h-3.5 w-3.5 shrink-0 text-ds-text-4" />
            <span className="truncate">{invite.location || "Reunión online"}</span>
            {invite.joinUrl ? (
              <a
                href={invite.joinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto inline-flex items-center gap-1 text-[12px] font-medium text-primary ds-tap"
              >
                Unirse <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </div>
        )}
        {invite.attendeeCount > 0 ? (
          <div className="flex items-center gap-2 text-ds-text-3">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-ds-text-4" />
            <span>{invite.attendeeCount} invitados</span>
          </div>
        ) : null}
      </div>

      {!invite.cancelled ? (
        <div className="flex flex-wrap gap-2">
          <RsvpButton
            label="Sí"
            icon={Check}
            active={status === "accepted"}
            variant="ok"
            disabled={busy}
            onClick={() => void respond("accepted")}
          />
          <RsvpButton
            label="Quizás"
            icon={HelpCircle}
            active={status === "tentative"}
            variant="warn"
            disabled={busy}
            onClick={() => void respond("tentative")}
          />
          <RsvpButton
            label="No"
            icon={X}
            active={status === "declined"}
            variant="danger"
            disabled={busy}
            onClick={() => void respond("declined")}
          />
        </div>
      ) : null}

      {!invite.calendarConnected ? (
        <p className="text-[12px] text-ds-text-3">
          Para responder como en Gmail,{" "}
          <a
            href="/opai/configuracion/integraciones/google-calendar"
            className="font-medium text-primary"
          >
            conectá Google Calendar
          </a>
          .
        </p>
      ) : status !== "needs_action" && !invite.cancelled ? (
        <p className="text-[12px] text-ds-text-3">
          Respuesta enviada al organizador
          {invite.googleHtmlLink ? (
            <>
              {" · "}
              <a
                href={invite.googleHtmlLink}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary"
              >
                Ver en Calendar
              </a>
            </>
          ) : null}
          .
        </p>
      ) : !invite.cancelled ? (
        <p className="text-[12px] text-ds-text-4">
          Al aceptar, OPAI responde la invitación y la sincroniza con tu Google Calendar.
        </p>
      ) : null}
    </Surface>
  );
}
