"use client";

import { Forward, Reply, ReplyAll, Sparkles } from "lucide-react";

type Props = {
  /** Hay a quién responder (hilo con inbound o remitente conocido). Si es false
   *  la barra muestra solo Reenviar (hilo solo de enviados). */
  canReply: boolean;
  /** Muestra "A todos" solo si el último inbound tiene destinatarios/CC extra. */
  replyAllAvailable: boolean;
  onReply: () => void;
  onReplyAll: () => void;
  onForward: () => void;
  onReplyAI: () => void;
};

/**
 * Barra de acciones estilo Gmail bajo el último mensaje (Bloque 2). Píldoras:
 * Responder (R) · Responder a todos (A, condicional) · Reenviar (F) ·
 * Responder con IA (I). Al abrir el composer esta barra desaparece
 * (exclusividad total). Móvil: fila scrollable sin kbd; desktop: kbd visible.
 */
export function CorreoActionBar({
  canReply,
  replyAllAvailable,
  onReply,
  onReplyAll,
  onForward,
  onReplyAI,
}: Props) {
  return (
    <div
      id="correo-suggested-reply"
      className="flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {canReply && (
        <Pill onClick={onReply} kbd="R" primary>
          <Reply className="h-4 w-4" /> Responder
        </Pill>
      )}
      {canReply && replyAllAvailable && (
        <Pill onClick={onReplyAll} kbd="A">
          <ReplyAll className="h-4 w-4" /> A todos
        </Pill>
      )}
      <Pill onClick={onForward} kbd="F">
        <Forward className="h-4 w-4" /> Reenviar
      </Pill>
      {canReply && (
        <Pill onClick={onReplyAI} kbd="I" accent>
          <Sparkles className="h-4 w-4" /> Responder con IA
        </Pill>
      )}
    </div>
  );
}

function Pill({
  onClick,
  kbd,
  primary,
  accent,
  children,
}: {
  onClick: () => void;
  kbd: string;
  primary?: boolean;
  accent?: boolean;
  children: React.ReactNode;
}) {
  const base = primary
    ? "bg-primary text-primary-foreground"
    : accent
      ? "border border-ds-border-default bg-ds-surface-1 text-tint-violet-fg hover:border-tint-violet"
      : "border border-ds-border-default bg-ds-surface-1 text-ds-text-1 hover:border-primary";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium ds-tap ${base}`}
    >
      {children}
      <kbd className="ml-0.5 hidden rounded bg-ds-surface-3/60 px-1 font-mono text-[11px] uppercase tracking-[0.08em] text-ds-text-4 md:inline">
        {kbd}
      </kbd>
    </button>
  );
}
