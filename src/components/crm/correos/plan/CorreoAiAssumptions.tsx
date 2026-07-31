"use client";

import { useState } from "react";
import { Check, RotateCcw, Trash2, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import type { CrmStructureAssumption } from "@/modules/crm/email/email-to-crm-structure.types";
import { PlanCollapsibleSection } from "./PlanCollapsibleSection";

type Props = {
  items: CrmStructureAssumption[];
  onChange: (items: CrmStructureAssumption[]) => void;
};

/**
 * Inline-editable list of assumption items.
 * No network calls — state lives in usePlanDraft via onChange.
 */
export function CorreoAiAssumptions({ items, onChange }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const active = items.filter((a) => !a.removed);
  const removedCount = items.filter((a) => a.removed).length;

  function startEdit(item: CrmStructureAssumption) {
    setEditingId(item.id);
    setEditText(item.text);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText("");
  }

  function confirmEdit(id: string) {
    if (!editText.trim()) return;
    onChange(
      items.map((a) =>
        a.id === id
          ? { ...a, text: editText.trim(), origin: "user" as const }
          : a,
      ),
    );
    setEditingId(null);
  }

  function restoreOriginal(id: string) {
    onChange(
      items.map((a) => (a.id === id ? { ...a, text: a.originalText, origin: "inference" as const } : a)),
    );
    setEditingId(null);
  }

  function softDelete(id: string) {
    onChange(items.map((a) => (a.id === id ? { ...a, removed: true } : a)));
  }

  function restoreAll() {
    onChange(items.map((a) => ({ ...a, removed: false })));
  }

  if (active.length === 0 && removedCount === 0) return null;

  return (
    <PlanCollapsibleSection
      title="Supuestos que apliqué"
      count={active.length}
      purpose="Se guardan como nota de trazabilidad en el negocio."
    >
      <ul className="space-y-1.5">
        {active.map((a) => (
          <li key={a.id}>
            {editingId === a.id ? (
              <div className="space-y-2">
                <Textarea
                  autoFocus
                  rows={3}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="min-h-[64px] resize-y text-[13px]"
                />
                <div className="flex gap-1.5">
                  <ActionBtn
                    label="Confirmar"
                    icon={<Check className="h-3.5 w-3.5" />}
                    onClick={() => confirmEdit(a.id)}
                    variant="ok"
                  />
                  <ActionBtn
                    label="Restaurar original"
                    icon={<RotateCcw className="h-3.5 w-3.5" />}
                    onClick={() => restoreOriginal(a.id)}
                    variant="neutral"
                  />
                  <ActionBtn
                    label="Cancelar"
                    icon={<X className="h-3.5 w-3.5" />}
                    onClick={cancelEdit}
                    variant="neutral"
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2 text-[13px] text-ds-text-2">
                <span className="min-w-0 flex-1">
                  {a.text}
                  {a.origin === "user" && (
                    <span className="ml-1.5 text-[12px] text-status-ok-fg">· confirmado</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => startEdit(a)}
                  className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg px-2 text-[12px] text-primary ds-tap sm:min-h-8"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => softDelete(a.id)}
                  aria-label="Eliminar supuesto"
                  className="inline-flex min-h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ds-text-4 ds-tap hover:text-status-danger-fg sm:min-h-8 sm:w-8"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {removedCount > 0 && (
        <button
          type="button"
          onClick={restoreAll}
          className="text-[12px] text-ds-text-4 ds-tap hover:text-primary"
        >
          {removedCount} eliminado{removedCount === 1 ? "" : "s"} · Restaurar
        </button>
      )}
    </PlanCollapsibleSection>
  );
}

function ActionBtn({
  label,
  icon,
  onClick,
  variant,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  variant: "ok" | "neutral";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-10 items-center gap-1 rounded-lg px-2.5 text-[12px] ds-tap sm:h-8 ${
        variant === "ok"
          ? "bg-status-ok-soft text-status-ok-fg"
          : "border border-ds-border-subtle text-ds-text-3"
      }`}
    >
      {icon} {label}
    </button>
  );
}
