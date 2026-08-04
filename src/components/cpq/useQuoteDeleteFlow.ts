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

export type QuoteDeleteFlowResult = {
  bundleDeleted?: boolean;
  data?: unknown;
};

type RequestDeleteQuoteTarget = {
  quoteId: string;
  quoteLabel?: string | null;
};

type RequestUnlinkQuoteTarget = RequestDeleteQuoteTarget & {
  bundleId: string;
};

type RequestDeleteBundleTarget = {
  bundleId: string;
  bundleLabel?: string | null;
  memberCount: number;
  mode: "unlink" | "cascade";
};

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

function formatBlockers(blockers: DeleteBlocker[]) {
  return blockers.map((b) => `• ${b.label}`).join("\n");
}

function withDeleteParams(
  baseUrl: string,
  params: Record<string, string | boolean | null | undefined>,
) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === false) continue;
    search.set(key, value === true ? "true" : value);
  }
  return search.size > 0 ? `${baseUrl}?${search.toString()}` : baseUrl;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<{ res: Response; json: T }> {
  const res = await fetch(url, init);
  const json = (await res.json().catch(() => ({}))) as T;
  return { res, json };
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

  const requestDeleteQuote = useCallback(
    async ({
      quoteId,
      quoteLabel,
    }: RequestDeleteQuoteTarget): Promise<QuoteDeleteFlowResult | null> => {
      const label = quoteLabel || "la cotización";
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
      let force = false;
      let reason: string | null = null;

      if (blockers.length > 0) {
        const value = await promptDialog({
          title: `Eliminar ${label}`,
          description: `Esta cotización tiene dependencias que normalmente impiden eliminarla:\n${formatBlockers(blockers)}\n\nPara forzar el archivado indica un motivo.${extraLines ? `\n\n${extraLines}` : ""}`,
          placeholder: "Motivo de la eliminación forzada",
          confirmLabel: "Eliminar de todas formas",
          multiline: true,
          validate: (v) => (v.trim().length < 3 ? "Indica un motivo (mín. 3 caracteres)" : null),
        });
        if (value === null) return null;
        force = true;
        reason = value.trim();
      } else {
        const ok = await confirmDialog({
          title: `Eliminar ${label}`,
          description: `Se moverá a la papelera y podrás restaurarla.${extraLines ? ` ${extraLines}` : ""}`,
          confirmLabel: "Eliminar cotización",
          variant: "destructive",
        });
        if (!ok) return null;
      }

      const deleteOnce = (nextForce: boolean, nextReason: string | null) =>
        fetchJson<{
          success?: boolean;
          error?: string;
          blockers?: DeleteBlocker[];
          trashId?: string;
          bundleDeleted?: boolean;
        }>(withDeleteParams(`/api/cpq/quotes/${quoteId}`, {
          force: nextForce,
          reason: nextReason,
        }), { method: "DELETE" });

      setDeletingId(quoteId);
      try {
        let { res, json } = await deleteOnce(force, reason);
        if (res.status === 409 && json.blockers?.length) {
          const value = await promptDialog({
            title: `Eliminar ${label}`,
            description: `Esta cotización tiene dependencias que normalmente impiden eliminarla:\n${formatBlockers(json.blockers)}\n\nPara forzar el archivado indica un motivo.`,
            placeholder: "Motivo de la eliminación forzada",
            confirmLabel: "Eliminar de todas formas",
            multiline: true,
            validate: (v) => (v.trim().length < 3 ? "Indica un motivo (mín. 3 caracteres)" : null),
          });
          if (value === null) return null;
          ({ res, json } = await deleteOnce(true, value.trim()));
        }

        if (!res.ok || !json.success) {
          throw new Error(json.error || "No se pudo eliminar la cotización");
        }
        onDeleted?.(quoteId);
        toast.success("Cotización eliminada", {
          description: json.bundleDeleted
            ? "La propuesta quedó vacía y también se eliminó."
            : undefined,
          action: json.trashId
            ? { label: "Deshacer", onClick: () => void restore(json.trashId!, quoteId) }
            : undefined,
        });
        return { bundleDeleted: json.bundleDeleted };
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo eliminar la cotización");
        return null;
      } finally {
        setDeletingId(null);
      }
    },
    [onDeleted, restore],
  );

  const requestUnlinkQuote = useCallback(
    async ({
      bundleId,
      quoteId,
      quoteLabel,
    }: RequestUnlinkQuoteTarget): Promise<QuoteDeleteFlowResult | null> => {
      const label = quoteLabel || "esta cotización";
      const ok = await confirmDialog({
        title: "Quitar de la propuesta",
        description: `Quitar "${label}" de la propuesta. La cotización no se elimina y queda disponible en el negocio.`,
        confirmLabel: "Quitar de la propuesta",
        variant: "destructive",
      });
      if (!ok) return null;

      setDeletingId(quoteId);
      try {
        const { res, json } = await fetchJson<{
          success?: boolean;
          error?: string;
          data?: { bundleDeleted?: boolean };
        }>(withDeleteParams(`/api/cpq/bundles/${bundleId}/quotes`, { quoteId }), {
          method: "DELETE",
        });
        if (!res.ok || !json.success) {
          throw new Error(json.error || "No se pudo quitar de la propuesta");
        }
        toast.success("Cotización quitada de la propuesta");
        return { bundleDeleted: json.data?.bundleDeleted, data: json.data };
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo quitar de la propuesta");
        return null;
      } finally {
        setDeletingId(null);
      }
    },
    [],
  );

  const requestDeleteBundle = useCallback(
    async ({
      bundleId,
      bundleLabel,
      memberCount,
      mode,
    }: RequestDeleteBundleTarget): Promise<QuoteDeleteFlowResult | null> => {
      const cascade = mode === "cascade";
      const label = bundleLabel || "esta propuesta";
      const ok = await confirmDialog({
        title: cascade ? "Eliminar propuesta y cotizaciones" : "Eliminar propuesta",
        description: cascade
          ? `Se eliminará "${label}" y sus ${memberCount} cotizaciones irán a la papelera.`
          : `Se eliminará "${label}" y sus ${memberCount} cotizaciones se conservarán en el negocio, fuera de la propuesta.`,
        confirmLabel: cascade ? "Eliminar propuesta y cotizaciones" : "Eliminar solo propuesta",
        variant: "destructive",
      });
      if (!ok) return null;

      const deleteOnce = (force: boolean, reason: string | null) =>
        fetchJson<{
          success?: boolean;
          error?: string;
          blockers?: DeleteBlocker[];
          data?: { bundleDeleted?: boolean };
        }>(withDeleteParams(`/api/cpq/bundles/${bundleId}`, { mode, force, reason }), {
          method: "DELETE",
        });

      setDeletingId(bundleId);
      try {
        let { res, json } = await deleteOnce(false, null);
        if (res.status === 409 && json.blockers?.length) {
          const value = await promptDialog({
            title: "Eliminar propuesta con bloqueos",
            description: `Bloqueos:\n${formatBlockers(json.blockers)}\n\nIngresa el motivo para forzar la eliminación.`,
            placeholder: "Motivo de eliminación",
            confirmLabel: "Eliminar de todas formas",
            multiline: true,
            validate: (v) => (v.trim().length < 3 ? "Indica un motivo (mín. 3 caracteres)" : null),
          });
          if (value === null) return null;
          ({ res, json } = await deleteOnce(true, value.trim()));
        }
        if (!res.ok || !json.success) {
          throw new Error(json.error || "No se pudo eliminar la propuesta");
        }
        toast.success(cascade ? "Propuesta y cotizaciones eliminadas" : "Propuesta eliminada");
        return { bundleDeleted: json.data?.bundleDeleted, data: json.data };
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo eliminar la propuesta");
        return null;
      } finally {
        setDeletingId(null);
      }
    },
    [],
  );

  return {
    deleteQuote,
    deletingId,
    deleting: deletingId !== null,
    requestDeleteQuote,
    requestUnlinkQuote,
    requestDeleteBundle,
  };
}
