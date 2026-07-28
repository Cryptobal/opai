"use client";

import { useState } from "react";
import { MoreHorizontal, Sparkles } from "lucide-react";
import Link from "next/link";
export type ComposeAction = "reply" | "replyAll" | "forward" | "ai";

type Props = {
  canCompose: boolean;
  threadId: string;
  onAction: (action: ComposeAction) => void;
  compact?: boolean;
};

/** Barra de acciones por hilo. En móvil: Responder + menú ⋯. */
export function EntityConversationActions({
  canCompose,
  threadId,
  onAction,
  compact = false,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  if (!canCompose) return null;

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onAction("reply")}
          className="inline-flex h-11 min-w-[44px] items-center justify-center rounded-lg bg-primary px-3 text-[12px] font-medium text-primary-foreground ds-tap"
        >
          Responder
        </button>
        <div className="relative">
          <button
            type="button"
            aria-label="Más acciones"
            onClick={() => setMenuOpen((v) => !v)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-ds-border-default text-ds-text-2 ds-tap"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-ds-border-default bg-ds-surface-1 p-1 shadow-lg">
              {(
                [
                  ["replyAll", "Responder a todos"],
                  ["forward", "Reenviar"],
                  ["ai", "✦ Responder con IA"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onAction(id);
                  }}
                  className="flex w-full items-center rounded-lg px-2 py-2 text-left text-[13px] text-ds-text-1 ds-tap hover:bg-ds-surface-2"
                >
                  {label}
                </button>
              ))}
              <Link
                href={`/crm/correos?thread=${threadId}`}
                className="flex w-full items-center rounded-lg px-2 py-2 text-[13px] text-ds-text-1 hover:bg-ds-surface-2"
                onClick={() => setMenuOpen(false)}
              >
                Abrir en Correo
              </Link>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <button
        type="button"
        onClick={() => onAction("reply")}
        className="inline-flex h-9 items-center rounded-lg border border-ds-border-default px-2.5 text-[12px] text-ds-text-1 ds-tap hover:border-primary"
      >
        Responder
      </button>
      <button
        type="button"
        onClick={() => onAction("replyAll")}
        className="inline-flex h-9 items-center rounded-lg border border-ds-border-default px-2.5 text-[12px] text-ds-text-1 ds-tap hover:border-primary"
      >
        A todos
      </button>
      <button
        type="button"
        onClick={() => onAction("forward")}
        className="inline-flex h-9 items-center rounded-lg border border-ds-border-default px-2.5 text-[12px] text-ds-text-1 ds-tap hover:border-primary"
      >
        Reenviar
      </button>
      <button
        type="button"
        onClick={() => onAction("ai")}
        className="inline-flex h-9 items-center gap-1 rounded-lg border border-tint-violet/40 bg-tint-violet/10 px-2.5 text-[12px] text-tint-violet-fg ds-tap"
      >
        <Sparkles className="h-3.5 w-3.5" /> Con IA
      </button>
      <Link
        href={`/crm/correos?thread=${threadId}`}
        className="inline-flex h-9 items-center rounded-lg px-2.5 text-[12px] text-ds-text-3 ds-tap hover:text-ds-text-1"
      >
        Abrir en Correo
      </Link>
    </div>
  );
}
