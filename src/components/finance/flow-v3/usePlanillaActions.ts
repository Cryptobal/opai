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

  /** Edita sección/categoría (o nombre) de una fila. */
  const updateRow = useCallback(
    (rowId: string, body: { name?: string; section?: string; categoryId?: string }) =>
      run(
        () =>
          api(`/api/finance/flow-v3/rows/${rowId}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          }),
        "Fila actualizada",
      ),
    [run],
  );

  const unarchiveRow = useCallback(
    (rowId: string) =>
      run(
        () => api(`/api/finance/flow-v3/rows/${rowId}/unarchive`, { method: "POST" }),
        "Fila desarchivada",
      ),
    [run],
  );

  /** Elimina una fila. Devuelve el motivo del 409 sin toast (la UI ofrece
   *  archivar); toast solo en éxito. */
  const deleteRow = useCallback(
    async (rowId: string): Promise<{ ok: true } | { ok: false; reason: string }> => {
      setBusy(true);
      try {
        await api(`/api/finance/flow-v3/rows/${rowId}`, { method: "DELETE" });
        toast.success("Fila eliminada");
        refetch();
        return { ok: true };
      } catch (err) {
        return { ok: false, reason: err instanceof Error ? err.message : "No se pudo eliminar" };
      } finally {
        setBusy(false);
      }
    },
    [refetch],
  );

  const createRecurring = useCallback(
    (body: Record<string, unknown>) =>
      run(
        () => api("/api/finance/flow-v3/recurring-plan", { method: "POST", body: JSON.stringify(body) }),
        "Egreso recurrente creado",
      ),
    [run],
  );

  const updateRecurring = useCallback(
    (id: string, body: Record<string, unknown>) =>
      run(
        () =>
          api(`/api/finance/flow-v3/recurring-plan/${id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          }),
        "Egreso recurrente actualizado",
      ),
    [run],
  );

  const deleteRecurring = useCallback(
    (id: string, keepCells: boolean) =>
      run(
        () =>
          api(`/api/finance/flow-v3/recurring-plan/${id}`, {
            method: "DELETE",
            body: JSON.stringify({ keepCells }),
          }),
        "Egreso recurrente eliminado",
      ),
    [run],
  );

  /** Cierra la semana v3. Devuelve motivo del 409 (ya cerrada) sin toast. */
  const closeWeek = useCallback(
    async (body: {
      weekEnd: string;
      closedBalance: number;
      notes?: string;
      manualReason?: string;
    }): Promise<{ ok: true } | { ok: false; reason: string }> => {
      setBusy(true);
      try {
        await api("/api/finance/flow-v3/weekly-close", {
          method: "POST",
          body: JSON.stringify(body),
        });
        toast.success("Semana cerrada");
        refetch();
        return { ok: true };
      } catch (err) {
        return { ok: false, reason: err instanceof Error ? err.message : "No se pudo cerrar" };
      } finally {
        setBusy(false);
      }
    },
    [refetch],
  );

  const reopenWeek = useCallback(
    (weekEnd: string) =>
      run(
        () =>
          api(`/api/finance/flow-v3/weekly-close?weekEnd=${weekEnd}`, { method: "DELETE" }),
        "Semana reabierta",
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

  /** Excluye un DTE del comprometido del flujo (ledger intacto). */
  const excludeDte = useCallback(
    (dteId: string, reason: string) =>
      run(
        () =>
          api("/api/finance/flow-v3/income-exclusions", {
            method: "POST",
            body: JSON.stringify({ dteId, reason }),
          }),
        "Factura excluida del flujo",
      ),
    [run],
  );

  /** Restaura un DTE previamente excluido. */
  const restoreDte = useCallback(
    (dteId: string) =>
      run(
        () =>
          api("/api/finance/flow-v3/income-exclusions", {
            method: "DELETE",
            body: JSON.stringify({ dteId }),
          }),
        "Factura restaurada al flujo",
      ),
    [run],
  );

  return {
    busy, createRow, renameRow, updateRow, unarchiveRow, deleteRow,
    archiveRow, setTemplateEndDate, setTemplateDiasCobro, deactivateTemplate,
    createRecurring, updateRecurring, deleteRecurring, closeWeek, reopenWeek, bulkFill,
    excludeDte, restoreDte,
  };
}
