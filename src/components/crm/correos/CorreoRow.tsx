"use client";

import type { ReactNode } from "react";
import { Clock, Paperclip, Sparkles, TrendingUp, CheckCircle2 } from "lucide-react";
import { Tag } from "@/components/opai-ds";
import type { CorreoThreadDTO } from "@/modules/crm/email/correos.types";
import { CorreoThreadActions } from "./CorreoThreadActions";

function snoozeLabel(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Santiago",
  });
}

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d < 7) return `hace ${d} d`;
  return new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short" });
}

export function CorreoRow({
  thread,
  onOpen,
  canModify,
  onChanged,
  trailing,
}: {
  thread: CorreoThreadDTO;
  onOpen: () => void;
  canModify: boolean;
  onChanged?: () => void;
  /** Slot final (kebab móvil). Si viene, reemplaza a las acciones hover. */
  trailing?: ReactNode;
}) {
  const unread = thread.isUnread;
  const subject = thread.subject || "(sin asunto)";
  const line2 = [subject, thread.snippet].filter(Boolean).join(" · ");

  return (
    <div className="group relative flex w-full items-stretch border-b border-ds-border-subtle last:border-0">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 flex-col gap-1 px-3 py-3 text-left ds-tap hover:bg-ds-surface-2"
      >
        <div className="flex items-center gap-2">
          {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />}
          <span className={`min-w-0 flex-1 truncate text-[13px] ${unread ? "font-semibold text-ds-text-1" : "text-ds-text-2"}`}>
            {thread.fromEmail || "—"}
          </span>
          <span className="shrink-0 text-[12px] text-ds-text-4">
            {relativeTime(thread.lastMessageAt)}
          </span>
        </div>
        <p className="truncate text-[13px]" title={line2}>
          <span className={unread ? "font-semibold text-ds-text-1" : "text-ds-text-3"}>{subject}</span>
          {thread.snippet && <span className="text-ds-text-3"> · {thread.snippet}</span>}
        </p>
        <div className="flex flex-wrap items-center gap-1 pt-0.5">
          {thread.accountId ? (
            <Tag variant="brand" size="sm">{thread.accountName || "Cuenta"}</Tag>
          ) : (
            <Tag variant="neutral" size="sm">Sin asociar</Tag>
          )}
          {thread.dealId && (
            <Tag variant="info" size="sm" icon={TrendingUp}>
              {thread.dealTitle || "Negocio"}
            </Tag>
          )}
          {thread.attachmentCount > 0 && (
            <Tag variant="neutral" size="sm" icon={Paperclip}>{thread.attachmentCount}</Tag>
          )}
          {thread.leadId && (
            <Tag variant="ok" size="sm" icon={CheckCircle2}>Lead</Tag>
          )}
          {thread.possibleLead && (
            <Tag variant="warn" size="sm" icon={Sparkles}>Posible lead</Tag>
          )}
          {thread.snoozedUntil && (
            <Tag
              variant="neutral"
              size="sm"
              icon={Clock}
              className="bg-tint-violet/30 border-tint-violet/40 text-tint-violet-fg"
            >
              hasta {snoozeLabel(thread.snoozedUntil)}
            </Tag>
          )}
        </div>
      </button>
      {trailing ? (
        <div className="flex items-center pr-1">{trailing}</div>
      ) : (
        <div className="hidden items-center pr-2 md:flex">
          <CorreoThreadActions
            threadId={thread.id}
            isUnread={unread}
            archived={Boolean(thread.archivedAt)}
            canModify={canModify}
            onDone={onChanged}
          />
        </div>
      )}
    </div>
  );
}
