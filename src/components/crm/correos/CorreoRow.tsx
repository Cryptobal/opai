"use client";

import { Paperclip, Sparkles, TrendingUp, CheckCircle2 } from "lucide-react";
import { Tag } from "@/components/opai-ds";
import type { CorreoThreadDTO } from "@/modules/crm/email/correos.types";
import { CorreoThreadActions } from "./CorreoThreadActions";

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
}: {
  thread: CorreoThreadDTO;
  onOpen: () => void;
  canModify: boolean;
  onChanged?: () => void;
}) {
  const unread = thread.isUnread;
  return (
    <div className="group relative flex w-full items-stretch border-b border-ds-border-subtle last:border-0">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 flex-col gap-1.5 px-3 py-3 text-left ds-tap hover:bg-ds-surface-2"
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className={`truncate text-[13px] text-ds-text-1 ${unread ? "font-semibold" : "font-medium"}`}
          >
            {thread.fromEmail || "—"}
          </span>
          <span className="shrink-0 text-[12px] text-ds-text-4">
            {relativeTime(thread.lastMessageAt)}
          </span>
        </div>
        <p className={`truncate text-[13px] text-ds-text-2 ${unread ? "font-semibold" : ""}`}>
          {thread.subject || "(sin asunto)"}
        </p>
        {thread.snippet && (
          <p className="truncate text-[12px] text-ds-text-4">{thread.snippet}</p>
        )}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {thread.accountId ? (
            <Tag variant="brand" size="sm">{thread.accountName || "Cuenta"}</Tag>
          ) : (
            <Tag variant="neutral" size="sm">Sin asociar</Tag>
          )}
          {thread.dealId && (
            <Tag variant="info" size="sm" icon={TrendingUp}>
              Negocio · {thread.dealTitle || "—"}
            </Tag>
          )}
          {thread.attachmentCount > 0 && (
            <Tag variant="neutral" size="sm" icon={Paperclip}>
              {thread.attachmentCount}
            </Tag>
          )}
          {thread.leadId && (
            <Tag variant="ok" size="sm" icon={CheckCircle2}>Lead creado</Tag>
          )}
          {thread.possibleLead && (
            <Tag variant="warn" size="sm" icon={Sparkles}>Posible lead</Tag>
          )}
        </div>
      </button>
      <div className="flex items-center pr-2">
        <CorreoThreadActions
          threadId={thread.id}
          isUnread={unread}
          archived={Boolean(thread.archivedAt)}
          canModify={canModify}
          onDone={onChanged}
        />
      </div>
    </div>
  );
}
