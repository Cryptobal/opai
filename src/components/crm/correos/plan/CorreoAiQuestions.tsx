"use client";

import { useState } from "react";
import { MessageSquareText, SendHorizonal } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import type { CrmStructureRefineAnswer } from "@/modules/crm/email/email-to-crm-structure.types";
import { PlanCollapsibleSection } from "./PlanCollapsibleSection";

type Props = {
  questions: string[];
  remainingRefines: number;
  onAnswer: (answer: CrmStructureRefineAnswer) => void;
};

/**
 * Per-question textarea list. Each question gets its own answer field.
 */
export function CorreoAiQuestions({ questions, remainingRefines, onAnswer }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<Set<string>>(new Set());

  if (questions.length === 0) return null;

  function submit(question: string) {
    const answer = (answers[question] ?? "").trim();
    if (!answer || remainingRefines <= 0) return;
    onAnswer({ question, answer });
    setSubmitted((prev) => new Set([...prev, question]));
  }

  return (
    <PlanCollapsibleSection
      title="Preguntas para afinar"
      count={questions.length}
      tone="surface-1"
      purpose={`Responder vuelve a analizar el correo con IA y actualiza el plan · quedan ${remainingRefines}`}
    >
      {remainingRefines <= 0 && (
        <p className="text-[12px] text-status-warn-fg">
          Límite de refinamientos alcanzado. Abre el asistente para continuar.
        </p>
      )}
      <ul className="space-y-3">
        {questions.map((q) => (
          <li key={q} className="space-y-1.5">
            <div className="flex items-start gap-1.5 text-[13px] text-ds-text-2">
              <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-tint-violet-fg" />
              <span>{q}</span>
            </div>
            {submitted.has(q) ? (
              <p className="pl-5.5 text-[12px] text-status-ok-fg">Respuesta enviada</p>
            ) : (
              <div className="flex gap-2 pl-5">
                <Textarea
                  rows={2}
                  placeholder="Tu respuesta…"
                  value={answers[q] ?? ""}
                  onChange={(e) =>
                    setAnswers((prev) => ({ ...prev, [q]: e.target.value }))
                  }
                  className="min-h-[56px] flex-1 resize-y text-[13px]"
                  disabled={remainingRefines <= 0}
                />
                <button
                  type="button"
                  aria-label="Enviar respuesta"
                  disabled={!answers[q]?.trim() || remainingRefines <= 0}
                  onClick={() => submit(q)}
                  className="self-end inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground ds-tap disabled:opacity-40 sm:h-9 sm:w-9"
                >
                  <SendHorizonal className="h-4 w-4" />
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </PlanCollapsibleSection>
  );
}
