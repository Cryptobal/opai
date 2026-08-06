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
import {
  normalizeFlowHealthReport,
  type FlowHealthReportV2,
} from "@/modules/finance/cashflow/flow-health.types";
import { ChangeAccountsDialog } from "@/components/finance/flow-v3/RowDialogs";
import { AddRowDialog } from "@/components/finance/flow-v3/AddRowDialog";
import type { FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";

type Props = {
  embedded?: boolean;
  /** Si el padre ya cargó salud (p.ej. flow-rows-config), evita refetch. */
  health?: FlowHealthReportV2 | null;
  onResolveAccount?: (accountPlanId: string) => void;
  onResolveRow?: (rowId: string) => void;
};

function stubRow(partial: {
  id: string;
  name: string;
  section: string;
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
    categoryId: null,
    canonicalKey: null,
    supplierId: null,
    isArchived: false,
    archivedWeekCutoff: null,
    isVirtual: false,
    cells: [],
  };
}

export function FlowHealthPanel({
  embedded = false,
  health: healthProp,
  onResolveAccount,
  onResolveRow,
}: Props) {
  const [report, setReport] = useState<FlowHealthReportV2 | null>(healthProp ?? null);
  const [loading, setLoading] = useState(!embedded && healthProp === undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [assignRow, setAssignRow] = useState<FlowMatrixRowDto | null>(null);
  const [createFor, setCreateFor] = useState<{
    name: string;
    section: string;
    accountPlanIds?: string[];
  } | null>(null);

  useEffect(() => {
    if (healthProp !== undefined) setReport(healthProp);
  }, [healthProp]);

  const load = useCallback(async () => {
    if (embedded && healthProp !== undefined) return;
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
      setReport(normalizeFlowHealthReport(j.data));
    } catch {
      setError("Error de red al cargar el diagnóstico");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [embedded, healthProp]);

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

  /** Problemas accionables (sin el aviso suave de GAV en activo/pasivo). */
  const issues =
    report.rowsWithoutAccounts.length +
    report.accountsWithoutRow.length +
    report.ambiguousAccounts.length;

  return (
    <div className="ds-page-enter space-y-5">
      {!embedded && (
        <StatGrid>
          <Stat
            label="Renglones sin cuentas"
            value={report.rowsWithoutAccounts.length}
            animate
          />
          <Stat
            label="Cuentas sin renglón"
            value={report.accountsWithoutRow.length}
            animate
          />
          <Stat
            label="Sin destino por defecto"
            value={report.ambiguousAccounts.length}
            animate
          />
          <Stat label="Renglones conectados" value={report.connectedRowCount} animate />
        </StatGrid>
      )}

      {issues === 0 && (
        <Surface elevation={1} padding="md">
          <EmptyState
            icon={CheckCircle2}
            tone="ok"
            title="Todo conectado"
            description="Los renglones de egreso tienen cuentas y el matching puede rutear la cartola."
          />
        </Surface>
      )}

      {report.expenseRowsOnNonExpenseAccounts.length > 0 && (
        <Surface elevation={1} padding="md" className="border border-ds-border-subtle">
          <h3 className="font-display text-[15px] text-ds-text-1 mb-2">
            Nota: GAV/Remuneraciones en cuenta de balance
          </h3>
          <p className="text-[13px] text-ds-text-3 mb-3">
            Aviso informativo (no bloquea el flujo). Impuestos y financiamiento con
            pasivo/activo son normales y no aparecen acá.
          </p>
          <ul className="ds-list-cascade space-y-2">
            {report.expenseRowsOnNonExpenseAccounts.map((item) => (
              <li
                key={`${item.rowId}-${item.accountCode}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ds-surface-2 px-3 py-2 min-h-11"
              >
                <div className="min-w-0">
                  <p className="text-[13px] text-ds-text-1 truncate">{item.rowName}</p>
                  <p className="text-[12px] text-ds-text-3 font-mono">
                    {item.accountCode} · {item.accountName} · {item.accountType}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-11 sm:min-h-9"
                  onClick={() => onResolveRow?.(item.rowId)}
                >
                  Revisar
                </Button>
              </li>
            ))}
          </ul>
        </Surface>
      )}

      <div className="grid grid-cols-1 min-[820px]:grid-cols-2 gap-4">
        <Surface elevation={1} padding="md">
          <h3 className="font-display text-[15px] text-ds-text-1 mb-3">
            Renglones sin cuentas
          </h3>
          {report.rowsWithoutAccounts.length === 0 ? (
            <p className="text-[13px] text-ds-text-3">Ninguno.</p>
          ) : (
            <ul className="space-y-2">
              {report.rowsWithoutAccounts.map((row) => (
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
                    onClick={() => {
                      if (onResolveRow) onResolveRow(row.id);
                      else setAssignRow(stubRow(row));
                    }}
                  >
                    Asignar cuentas
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Surface>

        <Surface elevation={1} padding="md">
          <h3 className="font-display text-[15px] text-ds-text-1 mb-3">
            Cuentas sin renglón destino
          </h3>
          {report.accountsWithoutRow.length === 0 ? (
            <p className="text-[13px] text-ds-text-3">Ninguna.</p>
          ) : (
            <ul className="space-y-2">
              {report.accountsWithoutRow.map((acc) => (
                <li
                  key={acc.accountPlanId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ds-surface-2 px-3 py-2 min-h-11"
                >
                  <div className="min-w-0">
                    <p className="text-[13px] text-ds-text-1 font-mono truncate">
                      {acc.code} · {acc.name}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-11 sm:min-h-9"
                    onClick={() =>
                      setCreateFor({
                        name: acc.name,
                        section: "GAV",
                        accountPlanIds: [acc.accountPlanId],
                      })
                    }
                  >
                    Crear renglón
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
                    {acc.rows.map((r) => r.name).join(" · ")}
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

      <ChangeAccountsDialog
        row={assignRow}
        busy={busy}
        onClose={() => setAssignRow(null)}
        onConfirm={async (accountPlanIds) => {
          if (!assignRow) return;
          setBusy(true);
          try {
            const r = await fetch(
              `/api/finance/flow-v3/rows/${assignRow.id}/accounts`,
              {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accountPlanIds }),
              },
            );
            const j = await r.json();
            if (!r.ok || !j?.success) {
              toast.error(j?.error ?? "No se pudieron asignar cuentas");
              return;
            }
            toast.success("Cuentas asignadas");
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
        initialSection={createFor?.section ?? null}
        presetName={createFor?.name ?? null}
        presetAccountPlanIds={createFor?.accountPlanIds ?? null}
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
              throw new Error(j?.error ?? "No se pudo crear el renglón");
            }
            const created = j.data as { id: string };
            if (createFor?.accountPlanIds?.length) {
              await fetch(`/api/finance/flow-v3/rows/${created.id}/accounts`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accountPlanIds: createFor.accountPlanIds }),
              });
            }
            toast.success("Renglón creado");
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
