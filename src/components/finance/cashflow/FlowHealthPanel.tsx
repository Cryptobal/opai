"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  EmptyState,
  Spinner,
  Stat,
  StatGrid,
  Surface,
  Tag,
} from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { FlowHealthReport } from "@/modules/finance/cashflow/flow-health.types";
import { ChangeCategoryDialog } from "@/components/finance/flow-v3/RowDialogs";
import { AddRowDialog } from "@/components/finance/flow-v3/AddRowDialog";
import type { FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";

type HealthTabProps = {
  onResolveAccount?: (accountPlanId: string) => void;
};

function stubRow(partial: {
  id: string;
  name: string;
  section: string;
  categoryId?: string | null;
}): FlowMatrixRowDto {
  return {
    id: partial.id,
    name: partial.name,
    section: partial.section,
    mapping: "MANUAL",
    orderIndex: 0,
    crmAccountId: null,
    installationId: null,
    recurringTemplateId: null,
    categoryId: partial.categoryId ?? null,
    supplierId: null,
    isArchived: false,
    archivedWeekCutoff: null,
    isVirtual: false,
    cells: [],
  };
}

export function FlowHealthPanel({ onResolveAccount }: HealthTabProps) {
  const [report, setReport] = useState<FlowHealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [assignRow, setAssignRow] = useState<FlowMatrixRowDto | null>(null);
  const [createFor, setCreateFor] = useState<{
    categoryId: string;
    name: string;
    section: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/finance/cashflow/flow-health", {
        cache: "no-store",
      });
      const j = await r.json();
      if (!r.ok || !j?.success) {
        setError(j?.error ?? "No se pudo cargar el diagnóstico");
        setReport(null);
        return;
      }
      setReport(j.data as FlowHealthReport);
    } catch {
      setError("Error de red al cargar el diagnóstico");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-ds-text-3">
        <Spinner size="sm" />
        <span className="text-[13px]">Cargando salud del flujo…</span>
      </div>
    );
  }

  if (error) {
    return (
      <Surface elevation={1} padding="md">
        <EmptyState
          icon={AlertTriangle}
          tone="warn"
          title="No se pudo cargar"
          description={error}
          action={
            <Button type="button" variant="outline" onClick={() => void load()}>
              Reintentar
            </Button>
          }
        />
      </Surface>
    );
  }

  if (!report) return null;

  const issues =
    report.rowsWithoutCategory.length +
    report.categoriesWithoutRow.length +
    report.ambiguousAccounts.length +
    report.expenseCategoriesOnNonExpenseAccounts.length;

  return (
    <div className="ds-page-enter space-y-5">
      <StatGrid>
        <Stat
          label="Filas sin categoría"
          value={report.rowsWithoutCategory.length}
          animate
        />
        <Stat
          label="Categorías sin fila"
          value={report.categoriesWithoutRow.length}
          animate
        />
        <Stat
          label="Cuentas ambiguas"
          value={report.ambiguousAccounts.length}
          animate
        />
        <Stat
          label="Filas conectadas"
          value={report.connectedRowCount}
          animate
        />
      </StatGrid>

      {issues === 0 && (
        <Surface elevation={1} padding="md">
          <EmptyState
            icon={CheckCircle2}
            tone="ok"
            title="Todo conectado"
            description="Las filas de egreso tienen categoría y las categorías activas tienen fila en la planilla."
          />
        </Surface>
      )}

      {report.expenseCategoriesOnNonExpenseAccounts.length > 0 && (
        <Surface elevation={1} padding="md" className="border border-status-warn-border">
          <h3 className="font-display text-[15px] text-ds-text-1 mb-2">
            Categorías de egreso en cuentas de activo/pasivo
          </h3>
          <p className="text-[13px] text-ds-text-3 mb-3">
            El gasto se contabiliza pero no llega al Estado de Resultados.
          </p>
          <ul className="ds-list-cascade space-y-2">
            {report.expenseCategoriesOnNonExpenseAccounts.map((item) => (
              <li
                key={`${item.categoryId}-${item.accountCode}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ds-surface-2 px-3 py-2 min-h-11"
              >
                <div className="min-w-0">
                  <p className="text-[13px] text-ds-text-1 truncate">
                    {item.categoryName}
                  </p>
                  <p className="text-[12px] text-ds-text-3 font-mono">
                    {item.accountCode} · {item.accountName} · {item.accountType}
                  </p>
                </div>
                <Tag variant="warn" size="sm">
                  Revisar
                </Tag>
              </li>
            ))}
          </ul>
        </Surface>
      )}

      <div className="grid grid-cols-1 min-[820px]:grid-cols-2 gap-4">
        <Surface elevation={1} padding="md">
          <h3 className="font-display text-[15px] text-ds-text-1 mb-3">
            Filas sin categoría
          </h3>
          {report.rowsWithoutCategory.length === 0 ? (
            <p className="text-[13px] text-ds-text-3">Ninguna.</p>
          ) : (
            <ul className="space-y-2">
              {report.rowsWithoutCategory.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ds-surface-2 px-3 py-2 min-h-11"
                >
                  <div className="min-w-0">
                    <p className="text-[13px] text-ds-text-1 truncate">{row.name}</p>
                    <p className="text-[12px] text-ds-text-3">{row.section}</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="min-h-11 sm:min-h-9"
                    onClick={() => setAssignRow(stubRow(row))}
                  >
                    Asignar categoría
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Surface>

        <Surface elevation={1} padding="md">
          <h3 className="font-display text-[15px] text-ds-text-1 mb-3">
            Categorías sin fila
          </h3>
          {report.categoriesWithoutRow.length === 0 ? (
            <p className="text-[13px] text-ds-text-3">Ninguna.</p>
          ) : (
            <ul className="space-y-2">
              {report.categoriesWithoutRow.map((cat) => (
                <li
                  key={cat.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ds-surface-2 px-3 py-2 min-h-11"
                >
                  <div className="min-w-0">
                    <p className="text-[13px] text-ds-text-1 truncate">{cat.name}</p>
                    <p className="text-[12px] text-ds-text-3 font-mono">{cat.code}</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-11 sm:min-h-9"
                    onClick={() =>
                      setCreateFor({
                        categoryId: cat.id,
                        name: cat.name,
                        section: suggestSection(cat.code),
                      })
                    }
                  >
                    Crear fila
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Surface>
      </div>

      <Surface elevation={1} padding="md">
        <h3 className="font-display text-[15px] text-ds-text-1 mb-3">
          Cuentas ambiguas
        </h3>
        {report.ambiguousAccounts.length === 0 ? (
          <p className="text-[13px] text-ds-text-3">Ninguna.</p>
        ) : (
          <ul className="space-y-2">
            {report.ambiguousAccounts.map((acc) => (
              <li
                key={acc.accountPlanId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ds-surface-2 px-3 py-2 min-h-11"
              >
                <div className="min-w-0">
                  <p className="text-[13px] text-ds-text-1 font-mono truncate">
                    {acc.code} · {acc.name}
                  </p>
                  <p className="text-[12px] text-ds-text-3">
                    {acc.categories.map((c) => c.name).join(" · ")}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-11 sm:min-h-9"
                  onClick={() => onResolveAccount?.(acc.accountPlanId)}
                >
                  Resolver
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[12px] text-ds-text-3">
          También podés revisar la planilla en{" "}
          <Link
            href="/finanzas/flujo-caja/planilla"
            className="text-primary underline"
          >
            Flujo de Caja
          </Link>
          .
        </p>
      </Surface>

      <ChangeCategoryDialog
        row={assignRow}
        busy={busy}
        onClose={() => setAssignRow(null)}
        onConfirm={async (categoryId, opts) => {
          if (!assignRow) return;
          setBusy(true);
          try {
            const r = await fetch(
              `/api/finance/flow-v3/rows/${assignRow.id}`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  categoryId,
                  ...(opts?.mapping ? { mapping: opts.mapping } : {}),
                }),
              },
            );
            const j = await r.json();
            if (!r.ok || !j?.success) {
              toast.error(j?.error ?? "No se pudo asignar");
              return;
            }
            toast.success("Categoría asignada");
            setAssignRow(null);
            await load();
          } catch {
            toast.error("Error de red");
          } finally {
            setBusy(false);
          }
        }}
      />

      <AddRowDialog
        open={!!createFor}
        onOpenChange={(o) => {
          if (!o) setCreateFor(null);
        }}
        busy={busy}
        lockedSection={createFor?.section ?? null}
        presetCategoryId={createFor?.categoryId ?? null}
        presetName={createFor?.name ?? null}
        onCreate={async (body) => {
          setBusy(true);
          try {
            const r = await fetch("/api/finance/flow-v3/rows", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            const j = await r.json();
            if (!r.ok || !j?.success) {
              throw new Error(j?.error ?? "No se pudo crear la fila");
            }
            toast.success("Fila creada");
            setCreateFor(null);
            await load();
            return j.data;
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

function suggestSection(code: string): string {
  if (
    code.startsWith("EGR_SUELDO") ||
    code.startsWith("EGR_QUINCENA") ||
    code.startsWith("EGR_PREVIRED") ||
    code.startsWith("EGR_TURNO") ||
    code.startsWith("EGR_FINIQUITO")
  ) {
    return "REMUNERACIONES";
  }
  if (code.startsWith("EGR_IVA") || code.startsWith("EGR_IMPUESTO")) {
    return "IMPUESTOS";
  }
  if (
    code.includes("SOCIO") ||
    code.includes("FACTORING") ||
    code.includes("PRESTAMO")
  ) {
    return "FINANCIAMIENTO";
  }
  return "GAV";
}
