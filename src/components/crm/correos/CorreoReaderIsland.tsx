"use client";

import { useEffect, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import {
  Archive,
  ChevronUp,
  Clock,
  Forward,
  Mail,
  MailOpen,
  Reply,
  Trash2,
  Undo2,
} from "lucide-react";
import {
  claimUndoHost,
  getUndoSnackbarSnapshot,
  subscribeUndoSnackbar,
} from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/lib/haptics";
import { runCorreoAction } from "./correo-thread-action-client";
import { CorreoIslandUndoBar } from "./CorreoIslandUndoBar";
import { CorreoReaderReplySheet } from "./CorreoReaderReplySheet";
import { CorreoSnoozeQuickPopover } from "./CorreoSnoozeQuickPopover";
import type { CorreoPrimaryAction } from "./correo-primary-action";
import type { ComposerMode } from "./CorreoComposerBox";
import type { CorreoSnoozeConfig } from "@/modules/crm/email/correo-snooze-presets";

type Props = {
  threadId: string;
  isUnread: boolean;
  archived: boolean;
  trashed: boolean;
  snoozedUntil: string | null;
  /** Acción primaria resuelta (elevada desde CorreoReplyBox); null = cargando. */
  primaryAction: CorreoPrimaryAction | null;
  /** Composer abierto → la isla de acciones se oculta (exclusividad). */
  composerOpen: boolean;
  snoozeConfig?: CorreoSnoozeConfig;
  onCompose: (mode: ComposerMode, ai?: boolean) => void;
  onSnoozeConfirm: (iso: string, label: string) => void;
  onOpenSnoozeSheet: () => void;
  onRemove?: (threadId: string) => void;
  onRemoveDone?: () => void;
  onUndoDone?: () => void;
  onDone?: () => void;
  onClose?: () => void;
};

const OPTIMISTIC: CorreoPrimaryAction = {
  mode: "reply",
  label: "Responder",
  canReply: true,
  replyAllAvailable: false,
};

/**
 * Isla de acciones flotante del lector móvil (Liquid Glass). 4 botones
 * icon-only (Archivar · Posponer · No leído · Eliminar) + píldora primaria
 * contextual (Responder/Reenviar) con split. Absorbe el estado de deshacer
 * mientras el lector está montado.
 */
export function CorreoReaderIsland({
  threadId,
  isUnread,
  archived,
  trashed,
  snoozedUntil,
  primaryAction,
  composerOpen,
  snoozeConfig,
  onCompose,
  onSnoozeConfirm,
  onOpenSnoozeSheet,
  onRemove,
  onRemoveDone,
  onUndoDone,
  onDone,
  onClose,
}: Props) {
  const undo = useSyncExternalStore(subscribeUndoSnackbar, getUndoSnackbarSnapshot, () => null);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);

  // Reclama el host del undo mientras el lector móvil está montado; libera al
  // desmontar (el snackbar global retoma el control).
  useEffect(() => claimUndoHost(), []);

  const snoozeActive =
    snoozedUntil != null && new Date(snoozedUntil).getTime() > Date.now();
  const primary = primaryAction ?? OPTIMISTIC;

  function act(action: "unarchive", okMsg: string) {
    void runCorreoAction(threadId, action, okMsg, onDone, undefined, onUndoDone);
  }
  function removeAfter(action: "archive" | "trash", okMsg: string, undoAct: "unarchive" | "untrash") {
    void triggerHaptic("light");
    onRemove?.(threadId);
    void runCorreoAction(threadId, action, okMsg, onRemoveDone ?? onDone, undoAct, onUndoDone);
    if (!onRemove) onClose?.();
  }
  function restoreAfter(action: "untrash" | "unsnooze", okMsg: string) {
    onRemove?.(threadId);
    void runCorreoAction(threadId, action, okMsg, onRemoveDone ?? onDone, undefined, onUndoDone);
    if (!onRemove) onClose?.();
  }
  function toggleRead() {
    void runCorreoAction(
      threadId,
      isUnread ? "markRead" : "markUnread",
      isUnread ? "Marcado como leído" : "Marcado como no leído",
      onDone,
      isUnread ? "markUnread" : "markRead",
      onUndoDone,
    );
  }

  const wrapCls = "fixed inset-x-3 z-40 lg:hidden";
  const wrapStyle: CSSProperties = { bottom: "calc(env(safe-area-inset-bottom) + 10px)" };

  // Undo absorbido: prioritario sobre la barra de acciones.
  if (undo) {
    return (
      <div className={wrapCls} style={wrapStyle}>
        <CorreoIslandUndoBar payload={undo} />
      </div>
    );
  }
  // Exclusividad: durante la redacción, la isla de acciones se oculta.
  if (composerOpen) return null;

  return (
    <div className={wrapCls} style={wrapStyle}>
      <div className="relative">
        {snoozeOpen && (
          <CorreoSnoozeQuickPopover
            config={snoozeConfig}
            onPick={(iso, label) => {
              setSnoozeOpen(false);
              onSnoozeConfirm(iso, label);
            }}
            onOpenSheet={() => {
              setSnoozeOpen(false);
              onOpenSnoozeSheet();
            }}
            onClose={() => setSnoozeOpen(false)}
          />
        )}
        <div className="opai-glass-strong opai-glass-shell flex h-[60px] items-center gap-0.5 rounded-[26px] px-1.5">
          <IconBtn
            label={archived ? "Desarchivar" : "Archivar"}
            onClick={() =>
              archived ? act("unarchive", "Restaurado a bandeja") : removeAfter("archive", "Archivado", "unarchive")
            }
          >
            <Archive className="h-5 w-5" />
          </IconBtn>
          <IconBtn
            label={snoozeActive ? "Dejar de posponer" : "Posponer"}
            active={snoozeActive}
            onClick={() =>
              snoozeActive ? restoreAfter("unsnooze", "Dejado de posponer") : setSnoozeOpen(true)
            }
          >
            <Clock className="h-5 w-5" />
          </IconBtn>
          <IconBtn
            label={isUnread ? "Marcar leído" : "Marcar no leído"}
            onClick={toggleRead}
          >
            {isUnread ? <MailOpen className="h-5 w-5" /> : <Mail className="h-5 w-5" />}
          </IconBtn>
          <IconBtn
            label={trashed ? "Restaurar" : "Eliminar"}
            tone="danger"
            onClick={() =>
              trashed ? restoreAfter("untrash", "Restaurado a bandeja") : removeAfter("trash", "Movido a la Papelera", "untrash")
            }
          >
            {trashed ? <Undo2 className="h-5 w-5" /> : <Trash2 className="h-5 w-5" />}
          </IconBtn>

          <span className="mx-0.5 h-7 w-px shrink-0 bg-ds-border-default" aria-hidden />

          <div className="ml-0.5 flex h-12 min-w-0 flex-1 items-stretch overflow-hidden rounded-2xl bg-primary text-primary-foreground">
            <button
              type="button"
              onClick={() => onCompose(primary.mode)}
              aria-label={primary.label}
              className="flex min-w-0 flex-1 items-center justify-center gap-1.5 px-2 ds-tap"
            >
              {primary.mode === "forward" ? (
                <Forward className="h-4 w-4 shrink-0" />
              ) : (
                <Reply className="h-4 w-4 shrink-0" />
              )}
              <span className="truncate text-[13px] font-semibold">{primary.label}</span>
            </button>
            <button
              type="button"
              onClick={() => setReplyOpen(true)}
              aria-label="Más opciones de respuesta"
              title="Más opciones de respuesta"
              className="flex w-9 shrink-0 items-center justify-center border-l border-primary-foreground/20 ds-tap"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {replyOpen && (
        <CorreoReaderReplySheet
          primary={primary}
          onCompose={onCompose}
          onClose={() => setReplyOpen(false)}
        />
      )}
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  active,
  tone,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  tone?: "danger";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      data-island-action=""
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex h-12 w-11 shrink-0 items-center justify-center rounded-2xl transition-colors ds-tap motion-reduce:transition-none",
        active
          ? "bg-status-warn-soft text-status-warn-fg"
          : tone === "danger"
            ? "text-ds-text-2 hover:bg-status-danger-soft hover:text-status-danger-fg"
            : "text-ds-text-2 hover:bg-primary/10 hover:text-primary",
      )}
    >
      {children}
    </button>
  );
}
