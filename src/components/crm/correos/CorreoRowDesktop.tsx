"use client";

import { Paperclip, Sparkles, Star } from "lucide-react";
import type { CorreoThreadDTO } from "@/modules/crm/email/correos.types";
import { CorreoCheckbox } from "./CorreoCheckbox";
import { CorreoDraftLabel } from "./CorreoDraftLabel";
import { CorreoSenderAvatar } from "./CorreoSenderAvatar";
import { parseSender } from "./correo-sender";
import { formatGmailDateChile } from "@/modules/crm/email/gmail-date-format";
import { CorreoThreadActions } from "./CorreoThreadActions";
import { CorreoMatchReasonBadge } from "./CorreoMatchReasonBadge";
import { CorreoTasksChip } from "./CorreoTasksChip";
import { runCorreoAction } from "./correo-thread-action-client";
import type { CorreoPreviewLines } from "./useCorreosViewPreferences";
import type { CorreoListMode, CorreoRowMode } from "./useCorreoWorkspaceLayout";
import { tintBar, tintSoft } from "./MailboxSwitcher";

function snoozeShort(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    timeZone: "America/Santiago",
  });
}

type Props = {
  thread: CorreoThreadDTO;
  onOpen: () => void;
  canModify: boolean;
  onChanged?: () => void;
  onRemoveDone?: () => void;
  onUndoDone?: () => void;
  onRemove?: (id: string) => void;
  onSnooze?: () => void;
  onAiMenu?: (anchor: { x: number; y: number }) => void;
  selected?: boolean;
  focused?: boolean;
  checked?: boolean;
  onToggleCheck?: () => void;
  previewLines?: CorreoPreviewLines;
  unified?: boolean;
  mailboxColor?: string | null;
  mailboxLabel?: string | null;
  listMode?: CorreoListMode;
  rowMode?: CorreoRowMode;
};

export function CorreoRowDesktop({
  thread, onOpen, canModify, onChanged, onRemoveDone, onUndoDone, onRemove, onSnooze,
  onAiMenu,
  selected = false, focused = false, checked, onToggleCheck, previewLines = 2,
  unified = false, mailboxColor = null, mailboxLabel = null,
  listMode = "full", rowMode = "default",
}: Props) {
  const unread = thread.isUnread;
  const compact = previewLines === 1;
  const subject = thread.subject || "(sin asunto)";
  const sender = parseSender(thread.fromEmail);
  const senderLabel = sender.name || sender.email || "—";
  const starred = Boolean(thread.starredAt);
  const active = selected || focused;
  const showMailbox = unified && Boolean(mailboxColor || mailboxLabel);
  const hasDeal = Boolean(thread.dealId && thread.dealTitle);
  const exceptionMark =
    thread.slaLevel === "danger"
      ? { label: thread.slaLabel ?? "!", tone: "danger" as const }
      : thread.slaLevel === "warn"
        ? { label: thread.slaLabel ?? "!", tone: "warn" as const }
        : !thread.accountId
          ? { label: "sin cuenta", tone: "warn" as const }
          : null;
  const tip = `${senderLabel} — ${subject}`;

  if (listMode === "mini") {
    return (
      <button
        type="button"
        data-correo-row={thread.id}
        data-listmode="mini"
        data-active={active ? "true" : undefined}
        title={tip}
        onClick={onOpen}
        aria-current={selected ? "true" : undefined}
        className={`group relative flex h-12 w-full items-center justify-center border-b border-l-2 last:border-b-0 ${
          selected
            ? "border-l-primary bg-primary/15"
            : focused
              ? "border-l-primary/80 bg-primary/10"
              : "border-l-transparent hover:bg-ds-surface-2"
        }`}
      >
        <span className="relative">
          <CorreoSenderAvatar
            fromEmail={thread.fromEmail}
            photoUrl={thread.fromPhotoUrl}
            compact
          />
          {unread && (
            <span
              aria-hidden
              className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-ds-surface-1"
            />
          )}
        </span>
      </button>
    );
  }

  const narrow = rowMode === "narrow";

  return (
    <div
      data-correo-row={thread.id}
      data-density={compact ? "compact" : "comfortable"}
      data-rowmode={rowMode}
      data-active={active ? "true" : undefined}
      className={`group relative flex w-full border-b border-l-2 border-ds-border-subtle pl-2 pr-3 last:border-b-0 ${
        narrow
          ? "h-auto min-h-[52px] flex-col gap-0.5 py-1.5"
          : `items-center gap-2 ${compact ? "h-9" : "h-11"}`
      } ${
        selected
          ? "border-l-primary bg-primary/15 hover:bg-primary/20"
          : focused
            ? "border-l-primary/80 bg-primary/10 hover:bg-primary/15"
            : "border-l-transparent hover:bg-ds-surface-2"
      } ${unread && !active ? "bg-ds-surface-2/40" : ""} ${
        checked && !active ? "bg-primary/10" : ""
      }`}
    >
      {showMailbox && mailboxColor && (
        <span
          aria-hidden
          className={`absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r ${tintBar(mailboxColor)}`}
        />
      )}

      {narrow ? (
        <>
          <div className="flex w-full items-center gap-2">
            {onToggleCheck && (
              <CorreoCheckbox
                checked={Boolean(checked)}
                onChange={onToggleCheck}
                ariaLabel={`Seleccionar ${subject}`}
              />
            )}
            {!compact && (
              <CorreoSenderAvatar
                fromEmail={thread.fromEmail}
                photoUrl={thread.fromPhotoUrl}
                compact
              />
            )}
            <button
              type="button"
              onClick={onOpen}
              className="flex min-w-0 flex-1 items-center gap-2 text-left outline-none focus-visible:ring-0"
            >
              <span className={`flex min-w-0 flex-1 items-center gap-1.5 truncate text-[13px] ${unread ? "font-semibold text-ds-text-1" : "text-ds-text-2"}`}>
                <span className="min-w-0 truncate">{senderLabel}</span>
                {thread.hasDraft ? <CorreoDraftLabel /> : null}
              </span>
              <span className={`flex-none text-[12px] tabular-nums ${unread ? "font-semibold text-primary" : "text-ds-text-4"}`}>
                {thread.snoozedUntil
                  ? `hasta ${snoozeShort(thread.snoozedUntil)}`
                  : formatGmailDateChile(thread.lastMessageAt)}
              </span>
            </button>
          </div>
          <button
            type="button"
            onClick={onOpen}
            className="flex w-full min-w-0 items-center gap-2 pl-8 text-left outline-none focus-visible:ring-0"
          >
            <span className="min-w-0 flex-1 truncate text-[13px]">
              <span className={unread ? "font-semibold text-ds-text-1" : "text-ds-text-2"}>{subject}</span>
              {thread.snippet && <span className="text-ds-text-4"> — {thread.snippet}</span>}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              {thread.openTaskCount > 0 && (
                <CorreoTasksChip count={thread.openTaskCount} level={thread.taskDueLevel} onOpen={onOpen} />
              )}
              {thread.attachmentCount > 0 && (
                <Paperclip aria-label={`${thread.attachmentCount} adjuntos`} className="h-3.5 w-3.5 text-ds-text-4" />
              )}
            </span>
          </button>
        </>
      ) : (
        <>
          {onToggleCheck && (
            <CorreoCheckbox
              checked={Boolean(checked)}
              onChange={onToggleCheck}
              ariaLabel={`Seleccionar ${subject}`}
            />
          )}
          {canModify && (
            <button
              type="button"
              title={starred ? "Quitar destacado" : "Destacar"}
              aria-label={starred ? "Quitar destacado" : "Destacar"}
              onClick={() =>
                void runCorreoAction(
                  thread.id,
                  starred ? "unstar" : "star",
                  starred ? "Quitado de Destacados" : "Destacado",
                  onChanged,
                  starred ? "star" : "unstar",
                )
              }
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md ds-tap"
            >
              <Star
                className={`h-4 w-4 ${
                  starred
                    ? "fill-status-warn-fg text-status-warn-fg"
                    : "text-ds-text-4 opacity-50 group-hover:opacity-100"
                }`}
              />
            </button>
          )}
          {!compact && (
            <CorreoSenderAvatar
              fromEmail={thread.fromEmail}
              photoUrl={thread.fromPhotoUrl}
              compact
            />
          )}
          <button
            type="button"
            onClick={onOpen}
            aria-current={selected ? "true" : undefined}
            className="flex h-full min-w-0 flex-1 items-center gap-3 text-left outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
          >
            <span
              className={`flex w-44 flex-none items-center gap-1.5 text-[13px] ${
                unread ? "font-semibold text-ds-text-1" : "text-ds-text-2"
              }`}
            >
              <span className="min-w-0 truncate">{senderLabel}</span>
              {thread.hasDraft ? <CorreoDraftLabel /> : null}
              {thread.messageCount > 1 && (
                <span className="shrink-0 font-normal text-ds-text-4">
                  ({thread.messageCount})
                </span>
              )}
              {showMailbox && mailboxLabel && (
                <span
                  className={`inline-flex h-5 shrink-0 items-center rounded-md px-1.5 text-[12px] font-medium ${
                    mailboxColor ? tintSoft(mailboxColor) : "bg-ds-surface-2 text-ds-text-3"
                  }`}
                >
                  {mailboxLabel}
                </span>
              )}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px]" title={subject}>
              {hasDeal ? (
                <>
                  <span className={unread ? "font-semibold text-ds-text-1" : "text-ds-text-2"}>
                    {subject}
                  </span>
                  {(thread.accountName || thread.dealTitle) && (
                    <span className="text-ds-text-3">
                      {" — "}
                      {thread.accountName && (
                        <span className="font-medium text-status-info-fg">
                          {thread.accountName}
                        </span>
                      )}
                      {thread.accountName && thread.dealTitle ? " › " : null}
                      {thread.dealTitle}
                      {thread.dealStageName ? ` · ${thread.dealStageName}` : ""}
                    </span>
                  )}
                </>
              ) : (
                <>
                  {thread.accountName && (
                    <>
                      <span className="inline-block max-w-[130px] truncate align-bottom font-medium text-status-info-fg">
                        {thread.accountName}
                      </span>
                      <span className="mx-1.5 text-ds-border-strong">·</span>
                    </>
                  )}
                  <span className={unread ? "font-semibold text-ds-text-1" : "text-ds-text-2"}>
                    {subject}
                  </span>
                  {thread.snippet && (
                    <span className="text-ds-text-4"> — {thread.snippet}</span>
                  )}
                </>
              )}
            </span>
          </button>
          <span className="flex shrink-0 items-center gap-1.5">
            <CorreoMatchReasonBadge reason={thread.matchReason} />
            {thread.openTaskCount > 0 && (
              <CorreoTasksChip
                count={thread.openTaskCount}
                level={thread.taskDueLevel}
                onOpen={onOpen}
              />
            )}
            {thread.attachmentCount > 0 && (
              <Paperclip aria-label={`${thread.attachmentCount} adjuntos`} className="h-3.5 w-3.5 text-ds-text-4" />
            )}
          </span>
          <span
            className={`flex w-28 flex-none items-center justify-end gap-1 text-right text-[12px] tabular-nums transition-opacity ${
              canModify || onAiMenu ? "group-hover:opacity-0" : ""
            }`}
          >
            {exceptionMark && !thread.snoozedUntil && (
              <span
                className={`font-medium ${
                  exceptionMark.tone === "danger"
                    ? "text-status-danger-fg"
                    : "text-status-warn-fg"
                }`}
              >
                {exceptionMark.label}
              </span>
            )}
            <span
              className={
                thread.snoozedUntil
                  ? "text-status-warn-fg"
                  : unread
                    ? "font-semibold text-primary"
                    : "text-ds-text-4"
              }
            >
              {thread.snoozedUntil
                ? `hasta ${snoozeShort(thread.snoozedUntil)}`
                : formatGmailDateChile(thread.lastMessageAt)}
            </span>
          </span>
          <div className="absolute right-2 top-1/2 hidden -translate-y-1/2 items-center rounded-lg bg-ds-surface-2 pl-1 group-hover:flex">
            {onAiMenu && (
              <button
                type="button"
                aria-label="Acciones IA"
                title="Acciones IA"
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  onAiMenu({ x: rect.left, y: rect.bottom + 4 });
                }}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-tint-violet-fg ds-tap hover:bg-tint-violet/10"
              >
                <Sparkles className="h-3.5 w-3.5" />
              </button>
            )}
            {canModify && (
              <CorreoThreadActions
                threadId={thread.id}
                isUnread={unread}
                archived={Boolean(thread.archivedAt)}
                trashed={Boolean(thread.trashedAt)}
                snoozedUntil={thread.snoozedUntil}
                starred={Boolean(thread.starredAt)}
                inSpam={Boolean(thread.spamAt)}
                canModify={canModify}
                onDone={onChanged}
                onRemoveDone={onRemoveDone}
                onUndoDone={onUndoDone}
                onRemove={onRemove}
                onSnooze={onSnooze}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
