"use client";

/**
 * useQuoteDeleteFlow — flujo compartido de eliminación de cotizaciones CPQ.
 *
 * Encapsula el patrón completo reutilizable desde el listado y la ficha:
 *   1. GET /delete-impact → previsualiza conteos, propuesta y bloqueos.
 *   2. Si hay bloqueos → promptDialog exige un motivo (force + reason).
 *      Si no → confirmDialog simple.
 *   3. DELETE /api/cpq/quotes/[id]?force=&reason= → mueve a papelera.
 *   4. toast con "Deshacer" que restaura desde la papelera (trashId).
 *
 * No monta nada: usa confirmDialog/promptDialog del confirm-service global.
 */

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { confirmDialog, promptDialog } from "@/components/ui/confirm-service";

type DeleteBlocker = { code: string; label: string };

export type QuoteDeleteImpact = {
  quote: { id: string; code: string; name: string | null; status: string };
  bundle: { id: string; code: string; memberCount: number } | null;
  counts: {
    positions: number;
    attachments: number;
    emailThreads: number;
    tasks: number;
  };
  blockers: DeleteBlocker[];
  warnings: string[];
};

export type QuoteDeleteTarget = { id: string; code?: string | null };

type UseQuoteDeleteFlowOptions = {
  /** Se llama tras eliminar OK (para remover optimista de la lista). */
  onDeleted?: (quoteId: string) => void;
  /** Se llama tras restaurar OK desde el toast "Deshacer". */
  onRestored?: (quoteId: string) => void;
};

function buildImpactSummary(impact: QuoteDeleteImpact): string {
  const c = impact.counts;
  const parts: string[] = [];
  if (c.positions) parts.push(`${c.positions} puesto${c.positions === 1 ? "" : "s"}`);
  if (c.attachments) parts.push(`${c.attachments} adjunto${c.attachments === 1 ? "" : "s"}`);
  if (c.emailThreads) parts.push(`${c.emailThreads} hilo${c.emailThreads === 1 ? "" : "s"} de correo`);
  if (c.tasks) parts.push(`${c.tasks} tarea${c.tasks === 1 ? "" : "s"}`);
  return parts.length > 0 ? `Se archivarán también: ${parts.join(", ")}.` : "";
}

export function useQuoteDeleteFlow(options: UseQuoteDeleteFlowOptions = {}) {
  const { onDeleted, onRestored } = options;
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const restore = useCallback(
    async (trashId: string, quoteId: string) => {
      try {
        const res = await fetch(`/api/cpq/quotes/trash/${trashId}/restore`, {
          method: "POST",
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || "No se pudo restaurar");
        }
        toast.success(`Cotización ${json.data?.code ?? ""} restaurada`.trim());
        onRestored?.(quoteId);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo restaurar la cotización");
      }
    },
    [onRestored],
  );

  const deleteQuote = useCallback(
    async (target: QuoteDeleteTarget): Promise<boolean> => {
      const quoteId = target.id;
      const label = target.code ? `la cotización ${target.code}` : "la cotización";
      let impact: QuoteDeleteImpact | null = null;
      try {
        const res = await fetch(`/api/cpq/quotes/${quoteId}/delete-impact`);
        const json = await res.json();
        if (res.ok && json.success) impact = json.data as QuoteDeleteImpact;
      } catch {
        // Sin impacto: seguimos con una confirmación genérica.
      }

      const blockers = impact?.blockers ?? [];
      const summary = impact ? buildImpactSummary(impact) : "";
      const warnings = impact?.warnings ?? [];
      const extraLines = [summary, ...warnings].filter(Boolean).join(" ");

      let reason: string | null = null;
      if (blockers.length > 0) {
        const blockerText = blockers.map((b) => `• ${b.label}`).join("\n");
        const value = await promptDialog({
          title: `Eliminar ${label}`,
          description: `Esta cotización tiene dependencias que normalmente impiden eliminarla:\n${blockerText}\n\nPara forzar el archivado indica un motivo.${extraLines ? `\n\n${extraLines}` : ""}`,
          placeholder: "Motivo de la eliminación forzada",
          confirmLabel: "Eliminar de todas formas",
          multiline: true,
          validate: (v) => (v.trim().length < 3 ? "Indica un motivo (mín. 3 caracteres)" : null),
        });
        if (value === null) return false;
        reason = value.trim();
      } else {
        const ok = await confirmDialog({
          title: `Eliminar ${label}`,
          description: `Se moverá a la papelera y podrás restaurarla.${extraLines ? ` ${extraLines}` : ""}`,
          confirmLabel: "Eliminar",
          variant: "destructive",
        });
        if (!ok) return false;
      }

      setDeletingId(quoteId);
      try {
        const params = new URLSearchParams();
        if (blockers.length > 0) params.set("force", "true");
        if (reason) params.set("reason", reason);
        const qs = params.toString();
        const res = await fetch(`/api/cpq/quotes/${quoteId}${qs ? `?${qs}` : ""}`, {
          method: "DELETE",
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || "No se pudo eliminar la cotización");
        }
        onDeleted?.(quoteId);
        const trashId = json.trashId as string | undefined;
        toast.success("Cotización eliminada", {
          description: json.bundleDeleted
            ? "La propuesta quedó vacía y también se eliminó."
            : undefined,
          action: trashId
            ? { label: "Deshacer", onClick: () => void restore(trashId, quoteId) }
            : undefined,
        });
        return true;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo eliminar la cotización");
        return false;
      } finally {
        setDeletingId(null);
      }
    },
    [onDeleted, restore],
  );

  return { deleteQuote, deletingId };
}
