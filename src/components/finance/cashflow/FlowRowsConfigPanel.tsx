"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Search, AlertTriangle, Inbox } from "lucide-react";
import {
  EmptyState,
  Spinner,
  Stat,
  StatGrid,
  Surface,
  Tag,
} from "@/components/opai-ds";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { SECTION_LABELS } from "@/components/finance/flow-v3/grid-classes";
import { FLOW_SECTION_ORDER } from "@/modules/finance/flow-v3/row-sort";
import { nestFlowRows } from "@/modules/finance/flow-v3/row-tree";
import type { FlowRowConfigItem } from "@/modules/finance/cashflow/flow-rows-config.service";
import { AddRowDialog } from "@/components/finance/flow-v3/AddRowDialog";
import type { AccountOption } from "./cashflow-config-types";
import { FlowRowConfigListItem } from "./FlowRowConfigListItem";
import { RowConfigDrawer } from "./RowConfigDrawer";
import { FlowHealthPanel } from "./FlowHealthPanel";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  countProblems,
  normalizeHealth,
  rowHasProblem,
} from "./flow-row-config-helpers";
import type { FlowHealthReportV2 } from "@/modules/finance/cashflow/flow-health.types";

type Props = {
  accountOptions: AccountOption[];
};

type SectionGroup = { key: string; rows: FlowRowConfigItem[] };

function nestConfigRows(rows: FlowRowConfigItem[]): FlowRowConfigItem[] {
  return nestFlowRows(rows);
}

type RowDialogState =
  | { kind: "delete"; row: FlowRowConfigItem }
  | { kind: "deleteBlocked"; row: FlowRowConfigItem; reason: string }
  | { kind: "archive"; row: FlowRowConfigItem }
  | null;

/** Secciones donde se puede crear renglón desde configuración. */
const ADDABLE_SECTIONS = [
  "INGRESOS",
  "REMUNERACIONES",
  "IMPUESTOS",
  "GAV",
  "FINANCIAMIENTO",
] as const;

const ADD_BUTTON_LABEL: Record<string, string> = {
  INGRESOS: "Renglón de ingreso",
  REMUNERACIONES: "Agregar renglón",
  IMPUESTOS: "Agregar renglón",
  GAV: "Agregar renglón",
  FINANCIAMIENTO: "Agregar renglón",
};

export function FlowRowsConfigPanel({ accountOptions }: Props) {
  const [rows, setRows] = useState<FlowRowConfigItem[]>([]);
  const [health, setHealth] = useState<FlowHealthReportV2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  /** Todas las secciones contraídas al abrir (más fácil de escanear). */
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(FLOW_SECTION_ORDER as readonly string[]),
  );
  const [drawerRow, setDrawerRow] = useState<FlowRowConfigItem | null>(null);
  const [addSection, setAddSection] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);
  const [rowDialog, setRowDialog] = useState<RowDialogState>(null);
  const [rowActionBusy, setRowActionBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/finance/cashflow/flow-rows-config", {
        cache: "no-store",
      });
      const j = await r.json();
      if (!r.ok || !j?.success) {
        setError(j?.error ?? "No se pudieron cargar los renglones");
        setRows([]);
        setHealth(null);
        return;
      }
      setRows((j.data?.rows ?? []) as FlowRowConfigItem[]);
      setHealth(normalizeHealth(j.data?.health));
    } catch {
      setError("Error de red al cargar renglones");
      setRows([]);
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows;
    if (q) {
      list = list.filter((row) => {
        const hay = [
          row.name,
          row.section,
          row.canonicalKey ?? "",
          ...row.accounts.map((a) => `${a.code} ${a.name}`),
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
    if (onlyProblems) {
      list = list.filter((row) => rowHasProblem(row, health));
    }
    return list;
  }, [rows, query, onlyProblems, health]);

  const groups = useMemo((): SectionGroup[] => {
    const bySection = new Map<string, FlowRowConfigItem[]>();
    for (const row of filtered) {
      const list = bySection.get(row.section);
      if (list) list.push(row);
      else bySection.set(row.section, [row]);
    }
    const filtering = Boolean(query.trim()) || onlyProblems;
    const ordered: SectionGroup[] = [];
    for (const key of FLOW_SECTION_ORDER) {
      const sectionRows = bySection.get(key) ?? [];
      const addable = (ADDABLE_SECTIONS as readonly string[]).includes(key);
      // Sin filtro: mostrar secciones addables aunque estén vacías (botón agregar).
      if (sectionRows.length || (!filtering && addable)) {
        ordered.push({ key, rows: sectionRows });
      }
    }
    for (const [key, sectionRows] of bySection) {
      if (
        !(FLOW_SECTION_ORDER as readonly string[]).includes(key) &&
        sectionRows.length
      ) {
        ordered.push({ key, rows: sectionRows });
      }
    }
    return ordered;
  }, [filtered, query, onlyProblems]);

  const problemCount = useMemo(
    () => countProblems(rows, health),
    [rows, health],
  );

  function toggleSection(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function patchRow(
    rowId: string,
    patch: { name?: string; section?: string },
  ) {
    setSavingId(rowId);
    try {
      const r = await fetch("/api/finance/cashflow/flow-rows-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowId, ...patch }),
      });
      const j = await r.json();
      if (!r.ok || !j?.success) {
        toast.error(j?.error ?? "No se pudo guardar");
        return;
      }
      await load();
    } catch {
      toast.error("Error de red al guardar");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteRow(rowId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    setRowActionBusy(true);
    try {
      const r = await fetch(`/api/finance/flow-v3/rows/${rowId}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok || !j?.success) {
        return { ok: false, reason: j?.error ?? "No se pudo eliminar" };
      }
      toast.success("Renglón eliminado");
      await load();
      return { ok: true };
    } catch {
      return { ok: false, reason: "Error de red al eliminar" };
    } finally {
      setRowActionBusy(false);
    }
  }

  async function archiveRow(rowId: string): Promise<void> {
    setRowActionBusy(true);
    try {
      const r = await fetch(`/api/finance/flow-v3/rows/${rowId}/archive`, { method: "POST" });
      const j = await r.json();
      if (!r.ok || !j?.success) {
        toast.error(j?.error ?? "No se pudo archivar");
        return;
      }
      toast.success("Renglón archivado");
      await load();
    } catch {
      toast.error("Error de red al archivar");
    } finally {
      setRowActionBusy(false);
    }
  }

  return (
    <div className="space-y-5 ds-page-enter">
      <Surface elevation={1} padding="md">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h2 className="font-semibold text-[15px]">Renglones del flujo</h2>
            <p className="text-[12px] text-ds-text-3 mt-0.5">
              Acá definís las líneas y su cuenta contable. En la planilla de Flujo de caja
              cargás los montos. “Solo con problemas” = sin cuentas o cuenta compartida sin destino.
            </p>
          </div>
          {health && (
            <StatGrid className="!grid-cols-2 sm:!grid-cols-4 gap-2">
              <Stat
                label="Sin cuentas"
                value={health.rowsWithoutAccounts.length}
                animate
              />
              <Stat
                label="Cuentas ambiguas"
                value={health.ambiguousAccounts.length}
                animate
              />
              <Stat
                label="Conectados"
                value={health.connectedRowCount}
                animate
              />
              <Stat label="Por revisar" value={problemCount} animate />
            </StatGrid>
          )}
        </div>

        <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ds-text-4" />
            <Input
              className="h-10 sm:h-9 pl-9"
              placeholder="Buscar renglón o cuenta…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <label
            className="flex items-center gap-2 min-h-11 sm:min-h-9 px-1 text-[13px] text-ds-text-2 shrink-0"
            title="Muestra renglones sin cuentas o con cuenta compartida sin destino por defecto"
          >
            <Switch checked={onlyProblems} onCheckedChange={setOnlyProblems} />
            Solo con problemas
          </label>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-ds-text-3">
            <Spinner size="sm" />
            <span className="text-[13px]">Cargando renglones…</span>
          </div>
        ) : error ? (
          <EmptyState
            icon={AlertTriangle}
            tone="warn"
            title="No se pudo cargar"
            description={error}
          />
        ) : filtered.length === 0 && (query.trim() || onlyProblems) ? (
          <EmptyState
            icon={Inbox}
            title="Sin coincidencias"
            description="Probá otro término o desactivá el filtro de problemas."
          />
        ) : (
          <div className="mt-4 space-y-3 ds-list-cascade">
            {groups.map((group) => {
              const isCollapsed = collapsed.has(group.key);
              const canAdd = (ADDABLE_SECTIONS as readonly string[]).includes(
                group.key,
              );
              const isIncome = group.key === "INGRESOS";
              return (
                <div
                  key={group.key}
                  className="rounded-ds-md border border-ds-border-default overflow-visible"
                >
                  <div className="flex items-center gap-2 bg-ds-surface-2 px-2 py-1 rounded-t-ds-md">
                    <button
                      type="button"
                      onClick={() => toggleSection(group.key)}
                      className="flex flex-1 items-center gap-2 min-h-11 px-1 text-left hover:bg-ds-surface-3 rounded-ds-sm transition-colors"
                      aria-expanded={!isCollapsed}
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-4 w-4 shrink-0 text-ds-text-3" />
                      ) : (
                        <ChevronDown className="h-4 w-4 shrink-0 text-ds-text-3" />
                      )}
                      <span className="font-semibold text-[13px]">
                        {SECTION_LABELS[group.key] ?? group.key}
                      </span>
                      <Tag variant="neutral" size="sm">
                        {group.rows.length}
                      </Tag>
                    </button>
                    {canAdd && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-10 sm:h-9 shrink-0"
                        onClick={() => setAddSection(group.key)}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        {ADD_BUTTON_LABEL[group.key] ?? "Agregar renglón"}
                      </Button>
                    )}
                  </div>
                  {!isCollapsed && (
                    <ul className="space-y-2 p-2 sm:p-3 border-t border-ds-border-subtle overflow-visible">
                      {group.rows.length === 0 ? (
                        <li className="px-2 py-3 text-[13px] text-ds-text-3">
                          Sin renglones. Usa el botón para agregar uno.
                        </li>
                      ) : (
                        nestConfigRows(group.rows).map((row) => (
                          <FlowRowConfigListItem
                            key={row.id}
                            row={row}
                            readOnly={isIncome}
                            accountOptions={accountOptions}
                            health={health}
                            saving={savingId === row.id}
                            onOpenDrawer={setDrawerRow}
                            onRename={(id, name) => void patchRow(id, { name })}
                            onAccountsChanged={() => void load()}
                          />
                        ))
                      )}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Surface>

      {health && (
        <FlowHealthPanel
          embedded
          health={health}
          onResolveRow={(rowId) => {
            const row = rows.find((r) => r.id === rowId);
            if (row) setDrawerRow(row);
          }}
          onResolveAccount={() => {
            setOnlyProblems(true);
          }}
        />
      )}

      <RowConfigDrawer
        row={drawerRow}
        open={!!drawerRow}
        onOpenChange={(o) => {
          if (!o) setDrawerRow(null);
        }}
        accountOptions={accountOptions}
        saving={!!drawerRow && savingId === drawerRow.id}
        deleteBusy={rowActionBusy}
        onSave={async (patch) => {
          if (!drawerRow) return;
          await patchRow(drawerRow.id, patch);
          setDrawerRow(null);
        }}
        onDelete={
          drawerRow && drawerRow.section !== "INGRESOS" && !drawerRow.canonicalKey
            ? () => setRowDialog({ kind: "delete", row: drawerRow })
            : undefined
        }
        onArchive={
          drawerRow && drawerRow.section !== "INGRESOS"
            ? () => setRowDialog({ kind: "archive", row: drawerRow })
            : undefined
        }
      />

      <ConfirmDialog
        open={rowDialog?.kind === "delete"}
        onOpenChange={(o) => {
          if (!o) setRowDialog(null);
        }}
        title={`Eliminar «${rowDialog?.kind === "delete" ? rowDialog.row.name : ""}»`}
        description="El renglón se elimina definitivamente. Solo es posible si no tiene plan, comprometido ni real en ninguna semana."
        confirmLabel="Eliminar"
        loading={rowActionBusy}
        onConfirm={async () => {
          if (rowDialog?.kind !== "delete") return;
          const row = rowDialog.row;
          const r = await deleteRow(row.id);
          if (r.ok) {
            setRowDialog(null);
            setDrawerRow(null);
          } else {
            setRowDialog({ kind: "deleteBlocked", row, reason: r.reason });
          }
        }}
      />
      <ConfirmDialog
        open={rowDialog?.kind === "deleteBlocked"}
        onOpenChange={(o) => {
          if (!o) setRowDialog(null);
        }}
        variant="default"
        title="No se puede eliminar el renglón"
        description={
          rowDialog?.kind === "deleteBlocked"
            ? `${rowDialog.reason}. ¿Archivarlo en su lugar? (se oculta hacia adelante y conserva el histórico).`
            : ""
        }
        confirmLabel="Archivar"
        cancelLabel="Cancelar"
        loading={rowActionBusy}
        onConfirm={async () => {
          if (rowDialog?.kind !== "deleteBlocked") return;
          const row = rowDialog.row;
          await archiveRow(row.id);
          setRowDialog(null);
          setDrawerRow(null);
        }}
      />
      <ConfirmDialog
        open={rowDialog?.kind === "archive"}
        onOpenChange={(o) => {
          if (!o) setRowDialog(null);
        }}
        variant="default"
        title={`Archivar «${rowDialog?.kind === "archive" ? rowDialog.row.name : ""}»`}
        description="El renglón dejará de aparecer hacia adelante en el flujo de caja. El histórico se conserva."
        confirmLabel="Archivar"
        loading={rowActionBusy}
        onConfirm={async () => {
          if (rowDialog?.kind !== "archive") return;
          await archiveRow(rowDialog.row.id);
          setRowDialog(null);
          setDrawerRow(null);
        }}
      />

      <AddRowDialog
        open={!!addSection}
        onOpenChange={(o) => {
          if (!o) setAddSection(null);
        }}
        busy={addBusy}
        lockedSection={addSection}
        onCreate={async (body) => {
          setAddBusy(true);
          try {
            const r = await fetch("/api/finance/flow-v3/rows", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            const j = await r.json();
            if (!r.ok || !j?.success) {
              throw new Error(j?.error ?? "No se pudo crear");
            }
            toast.success(
              addSection === "INGRESOS"
                ? "Renglón de ingreso creado"
                : "Renglón creado",
            );
            await load();
            return j.data;
          } finally {
            setAddBusy(false);
          }
        }}
      />
    </div>
  );
}
