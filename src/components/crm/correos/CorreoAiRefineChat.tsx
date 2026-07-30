"use client";

import { useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";
import type { CrmStructureRefineAnswer } from "@/modules/crm/email/email-to-crm-structure.types";

export type RefineChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type Props = {
  messages: RefineChatMessage[];
  busy: boolean;
  remaining: number;
  /** Pregunta/contexto actual (supuesto o openQuestion). */
  activeQuestion: string;
  onSend: (answer: CrmStructureRefineAnswer) => void;
  onOpenFullAssistant?: () => void;
};

/**
 * Composer de refinamiento dentro de la hoja del plan.
 */
export function CorreoAiRefineChat({
  messages,
  busy,
  remaining,
  activeQuestion,
  onSend,
  onOpenFullAssistant,
}: Props) {
  const [text, setText] = useState("");

  useEffect(() => {
    setText("");
  }, [activeQuestion]);

  function submit() {
    const answer = text.trim();
    if (!answer || busy || remaining <= 0) return;
    onSend({
      question: activeQuestion.trim() || "Ajuste al plan",
      answer,
    });
    setText("");
  }

  return (
    <div className="flex min-h-0 flex-col gap-2">
      {activeQuestion && (
        <p className="truncate text-[12px] text-ds-text-3" title={activeQuestion}>
          Sobre: {activeQuestion}
        </p>
      )}
      {messages.length > 0 && (
        <ul className="max-h-40 space-y-2 overflow-y-auto rounded-xl border border-ds-border-subtle bg-ds-surface-2 p-2">
          {messages.map((m) => (
            <li
              key={m.id}
              className={`rounded-lg px-2.5 py-2 text-ds-body ${
                m.role === "user"
                  ? "ml-6 bg-tint-violet/10 text-ds-text-1"
                  : "mr-6 bg-ds-surface-1 text-ds-text-2"
              }`}
            >
              {m.text}
            </li>
          ))}
        </ul>
      )}

      {remaining <= 0 ? (
        <div className="rounded-xl border border-status-warn-border bg-status-warn-soft px-3 py-2.5 text-ds-body text-status-warn-fg">
          Llegaste al límite de refinamientos en esta sesión.{" "}
          {onOpenFullAssistant && (
            <button type="button" onClick={onOpenFullAssistant} className="underline ds-tap">
              Abrir el asistente completo
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Ej. son 26 guardias, no 20…"
            aria-label="Respuesta de refinamiento"
            className="min-h-11 flex-1 resize-none rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 py-2 text-ds-body text-ds-text-1 placeholder:text-ds-text-4"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <button
            type="button"
            disabled={busy || !text.trim()}
            onClick={submit}
            aria-label="Enviar"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground ds-tap disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      )}
      <p className="text-[12px] text-ds-text-4">
        {remaining} refinamiento{remaining === 1 ? "" : "s"} restante
        {remaining === 1 ? "" : "s"}
      </p>
    </div>
  );
}
