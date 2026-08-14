"use client";

import { useEffect, useState } from "react";
import { MessageSquare, Sparkles } from "lucide-react";
import { EmptyState, Spinner } from "@/components/opai-ds";
import { dispatchAiCommand } from "@/lib/ai/ai-command-event";

type AnchoredConversation = {
  id: string;
  title: string;
  updatedAt: string;
  lastMessage: { role: string; content: string; createdAt: string } | null;
};

/**
 * Conversaciones ancladas al negocio. Vive dentro del panel de chat
 * (ya no como pestaña del detalle).
 */
export function DealCopilotoPanel({
  dealId,
  dealTitle,
  embedded = false,
  activeId = null,
  onSelect,
}: {
  dealId: string;
  dealTitle: string;
  embedded?: boolean;
  activeId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const [items, setItems] = useState<AnchoredConversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setError(null);
    fetch(`/api/ai/conversations/anchored?type=crm_deal&id=${encodeURIComponent(dealId)}`)
      .then(async (r) => {
        const j = (await r.json()) as { conversations?: AnchoredConversation[]; error?: string };
        if (!r.ok) throw new Error(j.error || "No se pudieron cargar");
        if (!cancelled) setItems(j.conversations ?? []);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error");
      });
    return () => {
      cancelled = true;
    };
  }, [dealId]);

  if (error) {
    return (
      <div className="rounded-xl border border-status-danger-border bg-status-danger-soft px-3 py-3 text-[13px] text-status-danger-fg">
        {error}
      </div>
    );
  }

  if (items === null) {
    return (
      <div className="flex justify-center py-4">
        <Spinner />
      </div>
    );
  }

  if (items.length === 0) {
    if (embedded) {
      return (
        <p className="px-1 py-2 text-[12px] text-ds-text-4">
          Aún no hay conversaciones ancladas a este negocio.
        </p>
      );
    }
    return (
      <EmptyState
        icon={Sparkles}
        title="Sin conversaciones del Copiloto"
        description="Analizá un correo ligado a este negocio para dejar aquí el plan de acciones y poder continuar."
        tone="brand"
        action={
          <button
            type="button"
            onClick={() =>
              dispatchAiCommand({
                prompt: `Continuá el análisis comercial del negocio «${dealTitle}».`,
                autoSend: false,
              })
            }
            className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-[13px] font-medium text-primary-foreground ds-tap"
          >
            Abrir asistente
          </button>
        }
      />
    );
  }

  return (
    <ul className="ds-list-cascade space-y-2">
      {items.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            onClick={() => {
              if (onSelect) {
                onSelect(c.id);
                return;
              }
              dispatchAiCommand({
                prompt: `Continuá la conversación anclada «${c.title}» del negocio «${dealTitle}» (id ${c.id}).`,
                autoSend: true,
              });
            }}
            className={`flex min-h-10 w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left ds-tap hover:border-primary ${
              activeId === c.id
                ? "border-primary bg-primary/5"
                : "border-ds-border-subtle bg-ds-surface-1"
            }`}
          >
            <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-tint-violet-fg" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-ds-text-1">{c.title}</span>
              {c.lastMessage && (
                <span className="mt-0.5 line-clamp-2 block text-[12px] text-ds-text-3">
                  {c.lastMessage.content}
                </span>
              )}
              <span className="mt-1 block text-[12px] text-ds-text-4">
                {new Date(c.updatedAt).toLocaleString("es-CL", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
