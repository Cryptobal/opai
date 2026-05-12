"use client";

import { X } from "lucide-react";
import {
  DTE_TYPE_SHORT_LABELS,
  SII_STATUS_CONFIG,
  fmtCLP,
} from "./shared/constants";
import type {
  DteFilters,
  CostCenterOption,
  InstallationOption,
} from "./shared/types";

const PAYMENT_LABELS: Record<string, string> = {
  UNPAID: "Por cobrar",
  PARTIAL: "Parcial",
  PAID: "Pagado",
  OVERDUE: "Vencido",
};

interface Props {
  filters: DteFilters;
  accounts: CostCenterOption[];
  installations: InstallationOption[];
  onRemove: (chipKey: string) => void;
  onClearAll: () => void;
}

/**
 * Row horizontal con scroll mobile mostrando filtros activos como chips
 * removibles. Se renderiza solo si hay al menos un filtro activo.
 */
export function ActiveFilterChips({
  filters,
  accounts,
  installations,
  onRemove,
  onClearAll,
}: Props) {
  const chips: { key: string; label: string }[] = [];
  filters.types.forEach((t) =>
    chips.push({
      key: `types:${t}`,
      label: DTE_TYPE_SHORT_LABELS[t] ?? `Tipo ${t}`,
    }),
  );
  filters.siiStatuses.forEach((s) =>
    chips.push({
      key: `siiStatuses:${s}`,
      label: SII_STATUS_CONFIG[s]?.label ?? s,
    }),
  );
  filters.paymentStatuses.forEach((s) =>
    chips.push({ key: `paymentStatuses:${s}`, label: PAYMENT_LABELS[s] ?? s }),
  );
  if (filters.periodo !== "ALL") {
    chips.push({ key: "periodo", label: `Período ${filters.periodo}` });
  }
  if (filters.accountId !== "ALL") {
    const a = accounts.find((x) => x.id === filters.accountId);
    chips.push({
      key: "accountId",
      label:
        filters.accountId === "NONE"
          ? "Sin cliente"
          : a?.name ?? "Cliente",
    });
  }
  if (filters.installationId !== "ALL") {
    const i = installations.find((x) => x.id === filters.installationId);
    chips.push({
      key: "installationId",
      label:
        filters.installationId === "NONE"
          ? "Sin instalación"
          : i?.name ?? "Instalación",
    });
  }
  if (filters.amountMin != null || filters.amountMax != null) {
    const min =
      filters.amountMin != null ? fmtCLP.format(filters.amountMin) : "—";
    const max =
      filters.amountMax != null ? fmtCLP.format(filters.amountMax) : "—";
    chips.push({ key: "amount", label: `${min} – ${max}` });
  }
  if (filters.onlyCeded) chips.push({ key: "onlyCeded", label: "Solo cedidas" });
  if (filters.onlyWithCreditNotes)
    chips.push({ key: "onlyWithCreditNotes", label: "Con NCs" });
  if (filters.onlyEmailFailed)
    chips.push({ key: "onlyEmailFailed", label: "Email falló" });
  if (filters.excludeDrafts)
    chips.push({ key: "excludeDrafts", label: "Sin borradores" });

  if (chips.length === 0) return null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => onRemove(c.key)}
          className="inline-flex items-center gap-1 px-2.5 h-7 rounded-full border border-ds-border-default bg-ds-surface-2 text-[12px] text-ds-text-2 hover:bg-ds-surface-3 transition-colors shrink-0"
        >
          <span>{c.label}</span>
          <X className="h-3 w-3" />
        </button>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="text-[12px] text-ds-text-3 hover:text-ds-text-1 underline underline-offset-2 shrink-0 px-2"
      >
        Limpiar todos
      </button>
    </div>
  );
}
