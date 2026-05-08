"use client";

import { useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  DTE_TYPE_LABELS,
  DTE_TYPE_TAG_VARIANT,
  SII_STATUS_CONFIG,
  buildPeriodOptions,
} from "./shared/constants";
import type {
  DteFilters,
  CostCenterOption,
  InstallationOption,
} from "./shared/types";

const PAYMENT_OPTIONS: { value: string; label: string }[] = [
  { value: "UNPAID", label: "Por cobrar" },
  { value: "PARTIAL", label: "Parcial" },
  { value: "PAID", label: "Pagado" },
  { value: "OVERDUE", label: "Vencido" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  filters: DteFilters;
  setFilters: (f: DteFilters) => void;
  update: <K extends keyof DteFilters>(key: K, value: DteFilters[K]) => void;
  reset: () => void;
  activeCount: number;
  accounts: CostCenterOption[];
  installations: InstallationOption[];
}

/** Pill toggle reusable para chips de tipo/estado/pago. */
function TogglePill({
  active,
  onClick,
  children,
  variant = "neutral",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  variant?: "neutral" | "brand" | "ok" | "warn" | "danger" | "info";
}) {
  const VARIANT_ACTIVE: Record<string, string> = {
    neutral: "bg-ds-surface-3 border-ds-border-default text-ds-text-1",
    brand:   "bg-primary/15 border-primary/40 text-primary",
    ok:      "bg-status-ok-soft border-status-ok-border text-status-ok-fg",
    warn:    "bg-status-warn-soft border-status-warn-border text-status-warn-fg",
    danger:  "bg-status-danger-soft border-status-danger-border text-status-danger-fg",
    info:    "bg-status-info-soft border-status-info-border text-status-info-fg",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-8 px-3 rounded-full border text-[12px] font-medium transition-colors",
        active
          ? VARIANT_ACTIVE[variant]
          : "bg-ds-surface-2 border-ds-border-default text-ds-text-3 hover:bg-ds-surface-3",
      )}
    >
      {children}
    </button>
  );
}

export function FiltersDrawer({
  open,
  onClose,
  filters,
  update,
  reset,
  activeCount,
  accounts,
  installations,
}: Props) {
  const periodOptions = useMemo(() => buildPeriodOptions(36), []);

  const toggleType = (t: number) => {
    update(
      "types",
      filters.types.includes(t)
        ? filters.types.filter((x) => x !== t)
        : [...filters.types, t],
    );
  };
  const toggleSii = (s: string) => {
    update(
      "siiStatuses",
      filters.siiStatuses.includes(s)
        ? filters.siiStatuses.filter((x) => x !== s)
        : [...filters.siiStatuses, s],
    );
  };
  const togglePayment = (s: string) => {
    update(
      "paymentStatuses",
      filters.paymentStatuses.includes(s)
        ? filters.paymentStatuses.filter((x) => x !== s)
        : [...filters.paymentStatuses, s],
    );
  };

  const minMaxInvalid =
    filters.amountMin != null &&
    filters.amountMax != null &&
    filters.amountMin > filters.amountMax;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="!p-0 sm:max-w-md flex flex-col w-full"
      >
        <SheetHeader className="px-5 py-4 border-b border-ds-border-default">
          <SheetTitle>Filtros</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {/* Tipo de documento */}
          <section className="space-y-2">
            <Label className="text-xs font-mono uppercase tracking-wider text-ds-text-4">
              Tipo de documento
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(DTE_TYPE_LABELS).map(([k, v]) => {
                const t = Number(k);
                const variant = DTE_TYPE_TAG_VARIANT[t] ?? "neutral";
                return (
                  <TogglePill
                    key={k}
                    active={filters.types.includes(t)}
                    onClick={() => toggleType(t)}
                    variant={variant}
                  >
                    {v}
                  </TogglePill>
                );
              })}
            </div>
          </section>

          {/* Estado SII */}
          <section className="space-y-2">
            <Label className="text-xs font-mono uppercase tracking-wider text-ds-text-4">
              Estado SII
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(SII_STATUS_CONFIG).map(([k, v]) => (
                <TogglePill
                  key={k}
                  active={filters.siiStatuses.includes(k)}
                  onClick={() => toggleSii(k)}
                  variant={
                    k === "ACCEPTED"
                      ? "ok"
                      : k === "PENDING"
                        ? "warn"
                        : k === "REJECTED"
                          ? "danger"
                          : "neutral"
                  }
                >
                  {v.label}
                </TogglePill>
              ))}
            </div>
          </section>

          {/* Período */}
          <section className="space-y-2">
            <Label className="text-xs font-mono uppercase tracking-wider text-ds-text-4">
              Período
            </Label>
            <Select
              value={filters.periodo}
              onValueChange={(v) => update("periodo", v)}
            >
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent className="max-h-[400px]">
                <SelectItem value="ALL">Todos los períodos</SelectItem>
                {periodOptions.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>

          {/* Centro de costo */}
          <section className="space-y-2">
            <Label className="text-xs font-mono uppercase tracking-wider text-ds-text-4">
              Centro de costo
            </Label>
            <Select
              value={filters.accountId}
              onValueChange={(v) => update("accountId", v)}
            >
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Centro" />
              </SelectTrigger>
              <SelectContent className="max-h-[400px]">
                <SelectItem value="ALL">Todos los centros</SelectItem>
                <SelectItem value="NONE">Sin asignar</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>

          {/* Instalación */}
          <section className="space-y-2">
            <Label className="text-xs font-mono uppercase tracking-wider text-ds-text-4">
              Instalación
            </Label>
            <Select
              value={filters.installationId}
              onValueChange={(v) => update("installationId", v)}
            >
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Instalación" />
              </SelectTrigger>
              <SelectContent className="max-h-[400px]">
                <SelectItem value="ALL">Todas las instalaciones</SelectItem>
                <SelectItem value="NONE">Sin instalación</SelectItem>
                {installations.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name}
                    {i.commune ? ` · ${i.commune}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>

          {/* Estado de pago */}
          <section className="space-y-2">
            <Label className="text-xs font-mono uppercase tracking-wider text-ds-text-4">
              Estado de pago
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {PAYMENT_OPTIONS.map((opt) => (
                <TogglePill
                  key={opt.value}
                  active={filters.paymentStatuses.includes(opt.value)}
                  onClick={() => togglePayment(opt.value)}
                  variant={
                    opt.value === "PAID"
                      ? "ok"
                      : opt.value === "OVERDUE"
                        ? "danger"
                        : opt.value === "PARTIAL"
                          ? "warn"
                          : "neutral"
                  }
                >
                  {opt.label}
                </TogglePill>
              ))}
            </div>
          </section>

          {/* Rango de monto */}
          <section className="space-y-2">
            <Label className="text-xs font-mono uppercase tracking-wider text-ds-text-4">
              Rango de monto
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ds-text-4 text-xs">
                  $
                </span>
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder="Mín"
                  className="pl-6 h-10"
                  value={filters.amountMin ?? ""}
                  onChange={(e) =>
                    update(
                      "amountMin",
                      e.target.value === "" ? null : Number(e.target.value),
                    )
                  }
                />
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ds-text-4 text-xs">
                  $
                </span>
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder="Máx"
                  className="pl-6 h-10"
                  value={filters.amountMax ?? ""}
                  onChange={(e) =>
                    update(
                      "amountMax",
                      e.target.value === "" ? null : Number(e.target.value),
                    )
                  }
                />
              </div>
            </div>
            {minMaxInvalid && (
              <p className="text-xs text-status-danger-fg">
                El mínimo no puede ser mayor al máximo.
              </p>
            )}
          </section>

          {/* Toggles avanzados */}
          <section className="space-y-3">
            <Label className="text-xs font-mono uppercase tracking-wider text-ds-text-4">
              Avanzado
            </Label>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-ds-text-1">
                  Solo cedidas a factoring
                </span>
                <Switch
                  checked={filters.onlyCeded}
                  onCheckedChange={(v) => update("onlyCeded", v)}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-ds-text-1">
                  Solo con NC asociadas
                </span>
                <Switch
                  checked={filters.onlyWithCreditNotes}
                  onCheckedChange={(v) => update("onlyWithCreditNotes", v)}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-ds-text-1">
                  Solo con email rebotado
                </span>
                <Switch
                  checked={filters.onlyEmailFailed}
                  onCheckedChange={(v) => update("onlyEmailFailed", v)}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-ds-text-1">
                  Excluir borradores
                </span>
                <Switch
                  checked={filters.excludeDrafts}
                  onCheckedChange={(v) => update("excludeDrafts", v)}
                />
              </div>
            </div>
          </section>
        </div>

        <div className="px-5 py-3 border-t border-ds-border-default flex items-center justify-between gap-2 bg-ds-surface-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={reset}
            className="text-ds-text-3"
          >
            Limpiar
          </Button>
          <Button size="sm" onClick={onClose} className="gap-1.5">
            Aplicar{activeCount > 0 ? ` (${activeCount})` : ""}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
