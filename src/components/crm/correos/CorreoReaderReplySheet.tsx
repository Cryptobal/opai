"use client";

import { Forward, Reply, ReplyAll, Sparkles } from "lucide-react";
import type { ComposerMode } from "./CorreoComposerBox";
import type { CorreoPrimaryAction } from "./correo-primary-action";

type Props = {
  primary: CorreoPrimaryAction;
  onCompose: (mode: ComposerMode, ai?: boolean) => void;
  onClose: () => void;
};

/**
 * Sheet del split de la píldora primaria: Responder (deshabilitado y rotulado
 * `no-reply` cuando no aplica) · A todos (solo si hay replyAll) · Reenviar ·
 * Redactar con IA.
 */
export function CorreoReaderReplySheet({ primary, onCompose, onClose }: Props) {
  const pick = (mode: ComposerMode, ai = false) => {
    onClose();
    onCompose(mode, ai);
  };
  const rowCls =
    "flex min-h-12 w-full items-center gap-3 px-4 text-left text-[14px] text-ds-text-1 ds-tap hover:bg-ds-surface-2 disabled:opacity-40";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        role="menu"
        className="w-full space-y-0.5 rounded-t-2xl border-t border-ds-border-subtle bg-ds-surface-1 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2 md:max-w-sm md:rounded-2xl md:border"
        onClick={(e) => e.stopPropagation()}
      >
        <div aria-hidden className="mx-auto mb-1 h-1 w-10 rounded-full bg-ds-surface-3" />
        <button
          type="button"
          role="menuitem"
          disabled={!primary.canReply}
          onClick={() => pick("reply")}
          className={rowCls}
        >
          <Reply className="h-5 w-5 shrink-0 text-ds-text-3" />
          <span className="flex-1">Responder</span>
          {!primary.canReply && <span className="text-[12px] text-ds-text-4">no-reply</span>}
        </button>
        {primary.replyAllAvailable && (
          <button type="button" role="menuitem" onClick={() => pick("all")} className={rowCls}>
            <ReplyAll className="h-5 w-5 shrink-0 text-ds-text-3" />
            <span className="flex-1">Responder a todos</span>
          </button>
        )}
        <button type="button" role="menuitem" onClick={() => pick("forward")} className={rowCls}>
          <Forward className="h-5 w-5 shrink-0 text-ds-text-3" />
          <span className="flex-1">Reenviar</span>
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => pick(primary.canReply ? "reply" : "forward", true)}
          className={rowCls}
        >
          <Sparkles className="h-5 w-5 shrink-0 text-tint-violet-fg" />
          <span className="flex-1">Redactar con IA</span>
        </button>
      </div>
    </div>
  );
}
