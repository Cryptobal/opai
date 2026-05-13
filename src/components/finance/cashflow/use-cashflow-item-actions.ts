"use client";
import { useState } from "react";
import { format } from "date-fns";
import type { ProjectionBucket } from "@/modules/finance/cashflow/types";
import type { DrawerBusy } from "./CashflowItemDrawerActions";

interface OccurrenceLike {
  itemId: string;
  scheduledDate: string;
  occurrenceId: string | null;
}

/**
 * Hook con los handlers de mover/editar/cancelar/terminar de un ítem
 * en el list view. Centraliza fetch + estados (busy/error/success) para
 * que el drawer mantenga solo la presentación.
 */
export function useCashflowItemActions(
  target: OccurrenceLike | null,
  onDone: (msg: string) => void,
) {
  const [busy, setBusy] = useState<DrawerBusy>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setError(null);
  }

  async function moveToBucket(targetBucket: ProjectionBucket) {
    if (!target) return;
    setBusy("move");
    setError(null);
    try {
      const targetDate = targetBucket.start.toISOString().slice(0, 10);
      const useUpsert = target.occurrenceId === null;
      const url = useUpsert
        ? `/api/finance/cashflow/occurrences/upsert-and-act`
        : `/api/finance/cashflow/occurrences/${target.occurrenceId}/move`;
      const body = useUpsert
        ? {
            action: "move",
            itemId: target.itemId,
            originalDate: target.scheduledDate,
            newDate: targetDate,
          }
        : { newDate: targetDate };
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (j?.success) onDone("Movido");
      else setError(j?.error ?? "No se pudo mover");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setBusy(null);
    }
  }

  async function saveAmount(n: number, formatted: string) {
    if (!target) return;
    setBusy("amount");
    setError(null);
    try {
      const useUpsert = target.occurrenceId === null;
      const url = useUpsert
        ? `/api/finance/cashflow/occurrences/upsert-and-act`
        : `/api/finance/cashflow/occurrences/${target.occurrenceId}/amount`;
      const body = useUpsert
        ? {
            action: "amount",
            itemId: target.itemId,
            originalDate: target.scheduledDate,
            amountClp: n,
          }
        : { amountClp: n };
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (j?.success) onDone(`Monto actualizado a $${formatted}`);
      else setError(j?.error ?? "No se pudo guardar");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setBusy(null);
    }
  }

  async function cancelOccurrence() {
    if (!target) return;
    setBusy("cancel");
    setError(null);
    try {
      let r: Response;
      if (target.occurrenceId === null) {
        r = await fetch(`/api/finance/cashflow/occurrences/upsert-and-act`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "cancel",
            itemId: target.itemId,
            originalDate: target.scheduledDate,
          }),
        });
      } else {
        r = await fetch(
          `/api/finance/cashflow/occurrences/${target.occurrenceId}/status`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "CANCELLED" }),
          },
        );
      }
      const j = await r.json();
      if (j?.success) onDone("Monto eliminado");
      else setError(j?.error ?? "No se pudo eliminar");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setBusy(null);
    }
  }

  async function endRecurrence() {
    if (!target) return;
    setBusy("end");
    setError(null);
    try {
      const [y, m, d] = target.scheduledDate.split("-").map(Number);
      const dt = new Date(y, (m ?? 1) - 1, d);
      dt.setDate(dt.getDate() - 1);
      const newEnd = format(dt, "yyyy-MM-dd");
      const r = await fetch(`/api/finance/cashflow/items/${target.itemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endDate: newEnd }),
      });
      const j = await r.json();
      if (j?.success) onDone("Serie terminada");
      else setError(j?.error ?? "No se pudo terminar");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setBusy(null);
    }
  }

  return {
    busy,
    error,
    reset,
    moveToBucket,
    saveAmount,
    cancelOccurrence,
    endRecurrence,
  };
}
