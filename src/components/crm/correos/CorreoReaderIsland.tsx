"use client";

import {
  useEffect,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Forward, Reply, ReplyAll } from "lucide-react";
import {
  claimUndoHost,
  getUndoSnackbarSnapshot,
  subscribeUndoSnackbar,
} from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import { CorreoIslandUndoBar } from "./CorreoIslandUndoBar";
import type { CorreoPrimaryAction } from "./correo-primary-action";
import type { ComposerMode } from "./CorreoComposerBox";

type Props = {
  /** Acción primaria resuelta (elevada desde CorreoReplyBox); null = cargando. */
  primaryAction: CorreoPrimaryAction | null;
  /** Composer abierto → la barra de respuesta se oculta (exclusividad). */
  composerOpen: boolean;
  onCompose: (mode: ComposerMode, ai?: boolean) => void;
  /**
   * Fila de chips de intención DENTRO de la misma isla glass (sobre Responder).
   * Misma exclusividad que el composer.
   */
  topSlot?: ReactNode;
};

const OPTIMISTIC: CorreoPrimaryAction = {
  mode: "reply",
  label: "Responder",
  canReply: true,
  replyAllAvailable: false,
};

/**
 * Barra inferior del lector móvil (Liquid Glass / patrón Gmail): Responder ·
 * A todos (condicional) · Reenviar. Acciones de hilo viven en la topbar.
 * Las sugerencias de respuesta van en la fila superior de la misma cápsula.
 * Absorbe el host de undo mientras el lector está montado.
 */
export function CorreoReaderIsland({
  primaryAction,
  composerOpen,
  onCompose,
  topSlot,
}: Props) {
  const undo = useSyncExternalStore(subscribeUndoSnackbar, getUndoSnackbarSnapshot, () => null);

  useEffect(() => claimUndoHost(), []);

  const primary = primaryAction ?? OPTIMISTIC;
  const replyPrimary = primary.canReply;
  const forwardPrimary = !primary.canReply;

  const wrapCls = "fixed inset-x-3 z-40 lg:hidden";
  const wrapStyle: CSSProperties = { bottom: "calc(env(safe-area-inset-bottom) + 10px)" };

  if (undo) {
    return (
      <div
        className={wrapCls}
        style={wrapStyle}
        data-correo-reader-island=""
      >
        <CorreoIslandUndoBar payload={undo} />
      </div>
    );
  }
  if (composerOpen) return null;

  return (
    <div
      className={wrapCls}
      style={wrapStyle}
      data-correo-reader-island=""
    >
      <div
        className={cn(
          "opai-glass-strong opai-glass-shell flex flex-col rounded-[26px] px-2",
          topSlot ? "gap-1.5 py-1.5" : "py-0",
        )}
      >
        {topSlot ? (
          <div className="min-w-0 px-0.5" data-island-smart-replies="">
            {topSlot}
          </div>
        ) : null}
        <div
          className="flex h-[56px] items-center gap-1.5"
          role="toolbar"
          aria-label="Responder"
        >
          <button
            type="button"
            data-island-action=""
            disabled={!primary.canReply}
            onClick={() => onCompose("reply", true)}
            aria-label={primary.canReply ? "Responder" : "Responder (no-reply)"}
            title={primary.canReply ? "Responder" : "no-reply"}
            className={cn(
              "flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-2xl text-[13px] font-semibold ds-tap",
              "disabled:cursor-not-allowed disabled:opacity-40",
              replyPrimary
                ? "bg-primary text-primary-foreground"
                : "bg-ds-surface-2 text-ds-text-2",
            )}
          >
            <Reply className="h-4 w-4 shrink-0" />
            <span className="truncate">Responder</span>
          </button>

          {primary.replyAllAvailable && (
            <button
              type="button"
              data-island-action=""
              onClick={() => onCompose("all", true)}
              aria-label="Responder a todos"
              className="flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-ds-surface-2 text-[13px] font-semibold text-ds-text-1 ds-tap"
            >
              <ReplyAll className="h-4 w-4 shrink-0" />
              <span className="truncate">A todos</span>
            </button>
          )}

          <button
            type="button"
            data-island-action=""
            onClick={() => onCompose("forward", true)}
            aria-label="Reenviar"
            className={cn(
              "flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-2xl text-[13px] font-semibold ds-tap",
              forwardPrimary
                ? "bg-primary text-primary-foreground"
                : "bg-ds-surface-2 text-ds-text-1",
            )}
          >
            <Forward className="h-4 w-4 shrink-0" />
            <span className="truncate">Reenviar</span>
          </button>
        </div>
      </div>
    </div>
  );
}
