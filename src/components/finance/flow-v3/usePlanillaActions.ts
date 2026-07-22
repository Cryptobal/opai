"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    ...init,
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? "Error");
  return json.data as T;
}

export interface ArchiveWarning {
  activeRecurringTemplateIds: string[];
}

/** Mutaciones de estructura de la planilla (filas y término de programación). */
export function usePlanillaActions(refetch: () => void) {
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>, okMsg?: string): Promise<T | null> => {
      setBusy(true);
      try {
        const r = await fn();
        if (okMsg) toast.success(okMsg);
        refetch();
        return r;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [refetch],
  );

  const createRow = useCallback(
    (body: Record<string, unknown>) =>
      run(() => api("/api/finance/flow-v3/rows", { method: "POST", body: JSON.stringify(body) }), "Fila creada"),
    [run],
  );

  const renameRow = useCallback(
    (rowId: string, name: string) =>
      run(() =>
        api(`/api/finance/flow-v3/rows/${rowId}`, { method: "PATCH", body: JSON.stringify({ name }) }),
      ),
    [run],
  );

  const archiveRow = useCallback(
    (rowId: string) =>
      run(
        () =>
          api<{ warning: ArchiveWarning | null }>(`/api/finance/flow-v3/rows/${rowId}/archive`, {
            method: "POST",
          }),
        "Fila archivada",
      ),
    [run],
  );

  /** Aplazar/fijar término de una programación (null = sin término). */
  const setTemplateEndDate = useCallback(
    (templateId: string, endDate: string | null) =>
      run(
        () =>
          api(`/api/finance/flow-v3/recurring-templates/${templateId}/end-date`, {
            method: "PATCH",
            body: JSON.stringify({ endDate }),
          }),
        endDate ? `Programación hasta ${endDate}` : "Programación sin término",
      ),
    [run],
  );

  /** "Desactivar programación también" al archivar: término = ayer. */
  const deactivateTemplate = useCallback(
    (templateId: string) => {
      const y = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      return setTemplateEndDate(templateId, y);
    },
    [setTemplateEndDate],
  );

  /** Término de pago POR CONTRATO (días; null = default del tenant). */
  const setTemplateDiasCobro = useCallback(
    (templateId: string, diasCobro: number | null) =>
      run(
        () =>
          api(`/api/finance/flow-v3/recurring-templates/${templateId}/dias-cobro`, {
            method: "PATCH",
            body: JSON.stringify({ diasCobro }),
          }),
        diasCobro != null ? `Cobro a ${diasCobro} días` : "Cobro según config del tenant",
      ),
    [run],
  );

  /** Fill-right estilo Sheets (F3): mismo monto en N semanas de una fila. */
  const bulkFill = useCallback(
    (rowId: string, weekStarts: string[], amount: number) =>
      run(
        () =>
          api("/api/finance/flow-v3/plan/bulk-fill", {
            method: "POST",
            body: JSON.stringify({ rowId, weekStarts, amount }),
          }),
        `${weekStarts.length} semana${weekStarts.length === 1 ? "" : "s"} rellenada${weekStarts.length === 1 ? "" : "s"}`,
      ),
    [run],
  );

  return { busy, createRow, renameRow, archiveRow, setTemplateEndDate, setTemplateDiasCobro, deactivateTemplate, bulkFill };
}
