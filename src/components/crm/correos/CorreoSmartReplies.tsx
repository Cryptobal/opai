"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Spinner } from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import { useCorreoReaderDock } from "./CorreoReaderDockContext";
import type { ReplyIntent } from "@/modules/crm/email/reply-intents.service";

type Props = {
  threadId: string;
  /** Composer abierto → los chips se ocultan (exclusividad con el composer). */
  composerOpen: boolean;
  /**
   * Abre el composer en modo respuesta. `instructions` alimenta el borrador IA
   * (`suggest-reply`); sin instrucciones = "Desde cero" (asistente abierto).
   */
  onCompose: (opts: { instructions?: string; ai?: boolean }) => void;
  /** `dock` = fila superior del dock desktop; `inline` = sobre la isla móvil. */
  variant?: "dock" | "inline";
};

/**
 * Chips de intención de respuesta (Bloque 7). Estado inicial: un solo chip
 * "✦ Sugerir respuestas" — nunca autogenera al abrir el hilo. Al tocarlo pide
 * las 3 intenciones (cacheadas por hilo) y cada chip abre el composer con el
 * borrador ya generado y editable.
 */
export function CorreoSmartReplies({
  threadId,
  composerOpen,
  onCompose,
  variant = "dock",
}: Props) {
  const dock = useCorreoReaderDock();
  const [intents, setIntents] = useState<ReplyIntent[] | null>(null);
  const [loading, setLoading] = useState(false);

  // Cambio de hilo: volver al chip inicial (nunca arrastrar sugerencias).
  useEffect(() => {
    setIntents(null);
    setLoading(false);
  }, [threadId]);

  async function loadIntents() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/crm/correos/${threadId}/reply-intents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = (await res.json().catch(() => ({}))) as {
        intents?: ReplyIntent[];
        error?: string;
        title?: string;
      };
      if (!res.ok || !data.intents?.length) {
        toast.error(data.title || "No se pudieron sugerir respuestas", {
          description: data.error || "Reintentá en unos segundos.",
        });
        return;
      }
      setIntents(data.intents);
    } catch {
      toast.error("No se pudieron sugerir respuestas", {
        description: "Sin conexión o error inesperado. Reintentá.",
      });
    } finally {
      setLoading(false);
    }
  }

  const chipCls =
    "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-tint-violet/40 bg-tint-violet/10 px-3 text-[13px] font-medium text-tint-violet-fg ds-tap disabled:opacity-50 sm:min-h-9";
  /** En la isla móvil el chip inicial ocupa el ancho para no flotar descentrado. */
  const triggerCls =
    variant === "inline"
      ? cn(
          chipCls,
          "w-full min-h-10 justify-center rounded-2xl border-tint-violet/30 bg-tint-violet/8",
        )
      : chipCls;

  const content = composerOpen ? null : (
    <div className="flex items-center gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {loading && !intents ? (
        <>
          <span className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-2xl bg-ds-surface-3 px-3 text-[12px] text-ds-text-3 sm:min-h-9 sm:w-auto sm:justify-start sm:rounded-full">
            <Spinner className="h-3.5 w-3.5" /> Pensando respuestas…
          </span>
          {variant !== "inline" && (
            <>
              <span className="h-9 w-28 shrink-0 animate-pulse rounded-full bg-ds-surface-3 motion-reduce:animate-none" />
              <span className="h-9 w-24 shrink-0 animate-pulse rounded-full bg-ds-surface-3 motion-reduce:animate-none" />
            </>
          )}
        </>
      ) : intents ? (
        <>
          {intents.map((intent) => (
            <button
              key={intent.id}
              type="button"
              title={intent.hint || intent.label}
              onClick={() =>
                onCompose({
                  instructions: intent.hint
                    ? `${intent.label}. ${intent.hint}`
                    : intent.label,
                })
              }
              className={chipCls}
            >
              <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">{intent.label}</span>
              {intent.hint && (
                <span className="hidden max-w-[14rem] truncate text-[12px] font-normal text-ds-text-3 lg:inline">
                  {intent.hint}
                </span>
              )}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onCompose({ ai: true })}
            className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] font-medium text-ds-text-2 ds-tap sm:min-h-9"
          >
            ✦ Desde cero
          </button>
        </>
      ) : (
        <button
          type="button"
          disabled={loading}
          onClick={() => void loadIntents()}
          className={triggerCls}
        >
          <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>Sugerir respuestas</span>
          <span className="text-[12px] font-normal text-ds-text-3">
            · con contexto del hilo
          </span>
        </button>
      )}
    </div>
  );

  if (variant === "inline") return content;
  // Dock desktop: fuera del scroll, sobre la fila de acciones.
  if (!dock.enabled || !dock.topHost || !content) return null;
  return createPortal(content, dock.topHost);
}
