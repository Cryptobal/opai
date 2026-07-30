"use client";

import { Forward, Reply, ReplyAll } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_CORREO_SHORTCUTS,
  type CorreoShortcuts,
} from "./useCorreosViewPreferences";

type Props = {
  /** Hay a quién responder (hilo con inbound o remitente conocido). Si es false
   *  la barra muestra solo Reenviar (hilo solo de enviados). */
  canReply: boolean;
  /** Muestra "A todos" solo si el último inbound tiene destinatarios/CC extra. */
  replyAllAvailable: boolean;
  onReply: () => void;
  onReplyAll: () => void;
  onForward: () => void;
  /** Teclas configuradas (hints del kbd); defaults estilo Gmail. */
  shortcuts?: Pick<CorreoShortcuts, "reply" | "replyAll" | "forward">;
};

/**
 * Barra de acciones estilo Gmail (Bloque 2).
 * Responder · Responder a todos (condicional) · Reenviar.
 * CorreoReplyBox la ancla al dock inferior del lector (fuera del scroll)
 * para que quede fija abajo como en Gmail. Al abrir el composer desaparece
 * (exclusividad total). Sin scroll lateral: grid de ancho fijo.
 */
export function CorreoActionBar({
  canReply,
  replyAllAvailable,
  onReply,
  onReplyAll,
  onForward,
  shortcuts = DEFAULT_CORREO_SHORTCUTS,
}: Props) {
  const cols = !canReply ? 1 : replyAllAvailable ? 3 : 2;

  return (
    <div
      id="correo-suggested-reply"
      className={cn(
        "grid w-full gap-0.5 rounded-xl border border-ds-border-subtle bg-ds-surface-1 p-0.5",
        cols === 1 && "grid-cols-1",
        cols === 2 && "grid-cols-2",
        cols === 3 && "grid-cols-3",
      )}
    >
      {canReply && (
        <ActionBtn onClick={onReply} kbd={shortcuts.reply} tone="primary" label="Responder">
          <Reply className="h-4 w-4 shrink-0" />
        </ActionBtn>
      )}
      {canReply && replyAllAvailable && (
        <ActionBtn onClick={onReplyAll} kbd={shortcuts.replyAll} label="A todos" shortLabel="Todos">
          <ReplyAll className="h-4 w-4 shrink-0" />
        </ActionBtn>
      )}
      <ActionBtn onClick={onForward} kbd={shortcuts.forward} label="Reenviar">
        <Forward className="h-4 w-4 shrink-0" />
      </ActionBtn>
    </div>
  );
}

function ActionBtn({
  onClick,
  kbd,
  tone = "default",
  label,
  shortLabel,
  children,
}: {
  onClick: () => void;
  kbd: string;
  tone?: "default" | "primary" | "accent";
  label: string;
  shortLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      aria-label={label}
      title={`${label} (${kbdDisplay(kbd)})`}
      className={cn(
        "flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-2.5 text-[12px] font-medium leading-tight ds-tap md:flex-row md:gap-1.5 md:px-2 md:py-2 md:text-ds-body",
        tone === "primary" && "text-primary hover:bg-primary/10",
        tone === "accent" && "text-tint-violet-fg hover:bg-tint-violet/10",
        tone === "default" && "text-ds-text-2 hover:bg-ds-surface-3 hover:text-ds-text-1",
      )}
    >
      {children}
      <span className="max-w-full truncate md:hidden">{shortLabel ?? label}</span>
      <span className="hidden max-w-full truncate md:inline">{label}</span>
      <kbd className="ml-0.5 hidden rounded bg-ds-surface-3/60 px-1 font-mono text-[12px] uppercase tracking-[0.08em] text-ds-text-4 lg:inline">
        {kbdDisplay(kbd)}
      </kbd>
    </button>
  );
}

function kbdDisplay(key: string): string {
  if (key === "Enter") return "↵";
  if (key === " ") return "Space";
  return key.length === 1 ? key.toUpperCase() : key;
}
