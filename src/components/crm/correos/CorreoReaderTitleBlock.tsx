"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { CorreoSystemLabels } from "./CorreoSystemLabels";
import { CorreoSenderAvatar } from "./CorreoSenderAvatar";
import { parseSender } from "./correo-sender";
import type { CorreoDetail } from "@/modules/crm/email/correos.types";

type Props = {
  detail: CorreoDetail;
  canModify: boolean;
  onDone?: () => void;
  onRemove?: (threadId: string) => void;
  onRemoveDone?: () => void;
  onUndoDone?: () => void;
  onClose?: () => void;
  onToggleStar?: () => void;
  /** Slot bajo el bloque (p. ej. franja de contexto). */
  below?: ReactNode;
};

function fmtCompactWhen(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleString("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * Bloque de título del lector móvil (`<lg`): asunto compacto (máx. 2 líneas)
 * + estrella + remitente denso. Prioriza espacio para el cuerpo del mensaje.
 */
export function CorreoReaderTitleBlock({
  detail,
  canModify,
  onDone,
  onRemove,
  onRemoveDone,
  onUndoDone,
  onClose,
  onToggleStar,
  below,
}: Props) {
  const t = detail.thread;
  const messages = detail.messages;
  const [expanded, setExpanded] = useState(false);

  const primary =
    messages.find((m) => m.direction !== "out") ??
    messages[messages.length - 1] ??
    messages[0] ??
    null;
  const last = messages[messages.length - 1] ?? primary;
  const sender = parseSender(primary?.fromEmail ?? null);
  const time = fmtCompactWhen(last?.sentAt ?? primary?.sentAt ?? null);
  const starred = Boolean(t.starredAt);

  return (
    <div className="space-y-1.5 lg:hidden">
      <CorreoSystemLabels
        threadId={t.id}
        trashedAt={t.trashedAt}
        snoozedUntil={t.snoozedUntil}
        canModify={canModify}
        onDone={onDone}
        onRemove={onRemove}
        onRemoveDone={onRemoveDone}
        onUndoDone={onUndoDone}
        onClose={onClose}
      />

      <div className="flex items-start gap-2">
        <h2 className="min-w-0 flex-1 font-display text-[16px] font-semibold leading-snug text-ds-text-1 [overflow-wrap:anywhere]">
          <span className="line-clamp-2">{t.subject || "(sin asunto)"}</span>
        </h2>
        {canModify && onToggleStar && (
          <button
            type="button"
            aria-label={starred ? "Quitar destacado" : "Destacar"}
            onClick={onToggleStar}
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ds-text-3 ds-tap hover:text-status-warn-fg"
          >
            <Star
              className={cn(
                "h-[18px] w-[18px]",
                starred && "fill-status-warn-fg text-status-warn-fg",
              )}
            />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <CorreoSenderAvatar fromEmail={primary?.fromEmail ?? null} compact />
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? "Ocultar detalles del remitente" : "Ver detalles del remitente"}
          className="flex min-h-8 min-w-0 flex-1 flex-col justify-center text-left ds-tap"
        >
          <span className="flex items-center gap-1">
            <span className="truncate text-[13px] font-semibold text-ds-text-1">
              {sender.name || sender.email || "—"}
            </span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-ds-text-4 transition-transform motion-reduce:transition-none",
                expanded && "rotate-180",
              )}
              aria-hidden
            />
          </span>
          <span className="truncate text-[12px] leading-tight text-ds-text-3">
            Para mí{time ? ` · ${time}` : ""}
          </span>
        </button>
      </div>

      {expanded && (
        <dl className="space-y-1 rounded-lg border border-ds-border-subtle bg-ds-surface-1 px-2.5 py-2 text-[12px]">
          <MetaRow label="De" value={primary?.fromEmail ?? sender.email} />
          <MetaRow label="Para" value={primary?.toEmails?.join(", ") ?? ""} />
          <MetaRow label="CC" value={primary?.ccEmails?.join(", ") ?? ""} />
          <MetaRow label="Reply-To" value={primary?.replyToEmail ?? ""} />
          <MetaRow
            label="Fecha"
            value={
              (last?.sentAt ?? primary?.sentAt)
                ? new Date(last?.sentAt ?? primary?.sentAt ?? "").toLocaleString("es-CL", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                : ""
            }
          />
        </dl>
      )}

      {below}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <dt className="w-16 shrink-0 text-ds-text-4">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-ds-text-2">{value}</dd>
    </div>
  );
}
