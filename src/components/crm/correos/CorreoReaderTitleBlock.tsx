"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
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
};

function fmtDateTime(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" })
    : "";
}

/**
 * Bloque de título del lector móvil (`<lg`): etiquetas de sistema + asunto como
 * título grande (hasta 3 líneas) + fila de remitente con metadata expandible.
 * El asunto ya no se trunca en el header; migra a él al scrollear.
 */
export function CorreoReaderTitleBlock({
  detail,
  canModify,
  onDone,
  onRemove,
  onRemoveDone,
  onUndoDone,
  onClose,
}: Props) {
  const t = detail.thread;
  const messages = detail.messages;
  const [expanded, setExpanded] = useState(false);

  // Remitente principal = primer inbound (con quien se conversa); si el hilo es
  // solo de enviados, el último mensaje. La hora es la del mensaje más reciente.
  const primary =
    messages.find((m) => m.direction !== "out") ??
    messages[messages.length - 1] ??
    messages[0] ??
    null;
  const last = messages[messages.length - 1] ?? primary;
  const sender = parseSender(primary?.fromEmail ?? null);
  const toLine = primary?.toEmails?.join(", ") ?? "";
  const time = fmtDateTime(last?.sentAt ?? primary?.sentAt ?? null);

  return (
    <div className="space-y-3 lg:hidden">
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

      <h2 className="font-display text-[22.5px] font-semibold leading-[1.2] text-ds-text-1 [overflow-wrap:anywhere]">
        <span className="line-clamp-3">{t.subject || "(sin asunto)"}</span>
      </h2>

      <div className="flex items-start gap-2.5">
        <span className="mt-0.5">
          <CorreoSenderAvatar fromEmail={primary?.fromEmail ?? null} compact />
        </span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? "Ocultar detalles del remitente" : "Ver detalles del remitente"}
          className="flex min-h-11 min-w-0 flex-1 flex-col justify-center text-left ds-tap"
        >
          <span className="flex items-center gap-1.5">
            <span className="truncate text-ds-body font-semibold text-ds-text-1">
              {sender.name || sender.email || "—"}
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-ds-text-4 transition-transform motion-reduce:transition-none",
                expanded && "rotate-180",
              )}
              aria-hidden
            />
          </span>
          <span className="flex items-center gap-1.5 text-[12px] text-ds-text-3">
            {toLine && <span className="truncate">Para {toLine}</span>}
            {time && <span className="shrink-0">· {time}</span>}
          </span>
        </button>
      </div>

      {expanded && (
        <dl className="space-y-1 rounded-xl border border-ds-border-subtle bg-ds-surface-1 px-3 py-2.5 text-[12px]">
          <MetaRow label="De" value={primary?.fromEmail ?? sender.email} />
          <MetaRow label="Para" value={toLine} />
          <MetaRow label="CC" value={primary?.ccEmails?.join(", ") ?? ""} />
          <MetaRow label="Reply-To" value={primary?.replyToEmail ?? ""} />
          <MetaRow label="Fecha" value={time} />
        </dl>
      )}
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
