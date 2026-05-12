"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DteFilters } from "../shared/types";
import { EMPTY_DTE_FILTERS } from "../shared/types";

interface Args {
  /** Filtros forzados desde la URL inicial (deeplinks). */
  forcedSiiStatus?: string | null;
  forcedPaymentStatus?: string | null;
}

/**
 * Hook centralizado para los filtros del listado de DTEs Emitidos.
 *
 * Encapsula:
 *   - estado del objeto `DteFilters`
 *   - debounce 300ms del campo `search`
 *   - count de filtros activos para badge en el botón "Filtros"
 *   - helpers `update`, `reset`, `removeOne` (chip removal)
 */
export function useDteFilters(args: Args = {}) {
  const [filters, setFilters] = useState<DteFilters>(() => {
    const init = { ...EMPTY_DTE_FILTERS };
    if (args.forcedSiiStatus) init.siiStatuses = [args.forcedSiiStatus];
    if (args.forcedPaymentStatus) init.paymentStatuses = [args.forcedPaymentStatus];
    return init;
  });

  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(filters.search.trim()), 300);
    return () => clearTimeout(t);
  }, [filters.search]);

  const activeCount = useMemo(() => {
    let n = 0;
    if (filters.types.length) n++;
    if (filters.siiStatuses.length) n++;
    if (filters.paymentStatuses.length) n++;
    // Default es "ALL" (todos los períodos); solo cuenta como filtro activo
    // si el usuario eligió un mes específico.
    if (filters.periodo !== "ALL") n++;
    if (filters.accountId !== "ALL") n++;
    if (filters.installationId !== "ALL") n++;
    if (filters.amountMin != null || filters.amountMax != null) n++;
    if (filters.onlyCeded) n++;
    if (filters.onlyWithCreditNotes) n++;
    if (filters.onlyEmailFailed) n++;
    if (filters.excludeDrafts) n++;
    return n;
  }, [filters]);

  const reset = useCallback(() => setFilters(EMPTY_DTE_FILTERS), []);

  const update = useCallback(
    <K extends keyof DteFilters>(key: K, value: DteFilters[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const removeOne = useCallback((chipKey: string) => {
    setFilters((prev) => {
      const next = { ...prev };
      // chipKey formato: "types:33", "siiStatuses:ACCEPTED", "periodo", ...
      const [field, value] = chipKey.split(":");
      if (field === "types" && value) {
        next.types = prev.types.filter((t) => String(t) !== value);
      } else if (field === "siiStatuses" && value) {
        next.siiStatuses = prev.siiStatuses.filter((s) => s !== value);
      } else if (field === "paymentStatuses" && value) {
        next.paymentStatuses = prev.paymentStatuses.filter((s) => s !== value);
      } else if (field === "periodo") {
        next.periodo = "ALL";
      } else if (field === "accountId") {
        next.accountId = "ALL";
      } else if (field === "installationId") {
        next.installationId = "ALL";
      } else if (field === "amount") {
        next.amountMin = null;
        next.amountMax = null;
      } else if (field === "onlyCeded") next.onlyCeded = false;
      else if (field === "onlyWithCreditNotes") next.onlyWithCreditNotes = false;
      else if (field === "onlyEmailFailed") next.onlyEmailFailed = false;
      else if (field === "excludeDrafts") next.excludeDrafts = false;
      return next;
    });
  }, []);

  return {
    filters,
    setFilters,
    update,
    reset,
    removeOne,
    activeCount,
    debouncedSearch,
  };
}
