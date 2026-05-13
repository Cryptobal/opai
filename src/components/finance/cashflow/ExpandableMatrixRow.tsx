"use client";
import type React from "react";
import { useEffect, useState, useCallback } from "react";
import { ChevronDown, ChevronRight as ChevronRightIcon, Building2, TrendingUp } from "lucide-react";
import type {
  ProjectionRow,
  ProjectionBucket,
  CashflowCellStatus,
} from "@/modules/finance/cashflow/types";
import { CellAmount } from "./CellAmount";
import { CellActionPopover } from "./CellActionPopover";
import { useDroppable } from "@dnd-kit/core";
import { ItemDetailRow } from "./ItemDetailRow";

const fmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

const CELL_STATUS_RANK: Record<CashflowCellStatus, number> = {
  PROJECTED: 0,
  INVOICED: 1,
  DRAFT: 2,
  CEDED: 3,
  PAID: 4,
};

/**
 * Para la fila agregada de categoría, mostramos el estado "más informativo"
 * entre todos los items de la fila en ese bucket. Misma precedencia que el
 * server-side. INVOICED con mora más alta gana en empate.
 */
function aggregateRowStatus(
  row: ProjectionRow,
  bucketKey: string,
): { cellStatus: CashflowCellStatus; daysOverdue: number } {
  let best: CashflowCellStatus = "PROJECTED";
  let maxOverdue = 0;
  for (const item of row.items) {
    const cell = item.values.find((v) => v.bucketKey === bucketKey);
    if (!cell?.cellStatus) continue;
    if (CELL_STATUS_RANK[cell.cellStatus] > CELL_STATUS_RANK[best]) {
      best = cell.cellStatus;
      maxOverdue = cell.daysOverdue ?? 0;
    } else if (
      cell.cellStatus === "INVOICED" &&
      best === "INVOICED" &&
      (cell.daysOverdue ?? 0) > maxOverdue
    ) {
      maxOverdue = cell.daysOverdue ?? 0;
    }
  }
  return { cellStatus: best, daysOverdue: maxOverdue };
}

const STORAGE_PREFIX = "cashflow.expanded.";

function isExpandedInStorage(categoryId: string | null): boolean {
  if (typeof window === "undefined" || !categoryId) return false;
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + categoryId) === "1";
  } catch {
    return false;
  }
}

function setExpandedInStorage(categoryId: string | null, expanded: boolean) {
  if (typeof window === "undefined" || !categoryId) return;
  try {
    if (expanded) {
      window.localStorage.setItem(STORAGE_PREFIX + categoryId, "1");
    } else {
      window.localStorage.removeItem(STORAGE_PREFIX + categoryId);
    }
  } catch {
    // ignore
  }
}

function DroppableBucketCell({
  bucketKey,
  children,
  className = "",
}: {
  bucketKey: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: bucketKey });
  return (
    <td
      ref={setNodeRef}
      className={`${className} ${isOver ? "bg-status-info-soft transition-colors" : ""}`}
    >
      {children}
    </td>
  );
}

interface Props {
  row: ProjectionRow;
  actualByCellKey?: Map<string, number>;
  /** Ajustes IPC PENDING indexados por `${itemId}_${bucketKey}`. La celda
   *  con marker muestra un mini-badge ámbar para que el reajuste no se
   *  pase de fecha. */
  ipcPending?: Map<string, Array<{ id: string; dueDate: string }>>;
  buckets: ProjectionBucket[];
  granularity: "weekly" | "monthly";
  onActionDone?: () => void;
}

/**
 * Fila de categoría con chevron para expandir y ver el desglose por item
 * (instalación / contrato / template). El estado expandido persiste en
 * localStorage por categoryId.
 */
export function ExpandableMatrixRow({
  row,
  actualByCellKey,
  ipcPending,
  buckets,
  granularity,
  onActionDone,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(isExpandedInStorage(row.categoryId));
  }, [row.categoryId]);

  function toggle() {
    setExpanded((prev) => {
      const next = !prev;
      setExpandedInStorage(row.categoryId, next);
      return next;
    });
  }

  // Target agregado por bucket para popover/DnD de la fila colapsada.
  // Devolvemos el primer item con amount > 0 (incluyendo cuotas vírgenes
  // — itemId+scheduledDate basta para materializar al primer move).
  // Items `_orphan` (sin itemId real) se filtran porque el endpoint de
  // materialize requiere un UUID válido.
  function findAggregatedTarget(bucketKey: string) {
    for (const item of row.items) {
      if (item.itemId === "_orphan") continue;
      const cell = item.values.find((v) => v.bucketKey === bucketKey);
      if (cell && (cell.amount > 0 || cell.occurrenceId)) {
        return {
          id: cell.occurrenceId,
          itemId: item.itemId,
          originalDate: cell.scheduledDate,
          amountClp: cell.amount,
          cellStatus: cell.cellStatus,
          dteId: cell.dteId ?? null,
          daysOverdue: cell.daysOverdue ?? 0,
          crmAccountId: item.crmAccountId,
        };
      }
    }
    return null;
  }

  const onActionDoneSafe = onActionDone ?? (() => {});

  return (
    <>
      <tr className="hover:bg-muted/20">
        <td className="sticky left-0 z-20 bg-card p-2 truncate min-w-[140px] max-w-[160px] sm:min-w-[180px] sm:max-w-none border-r border-border/50">
          <button
            type="button"
            onClick={toggle}
            className="flex items-center gap-1.5 w-full text-left min-h-[44px] sm:min-h-0"
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-ds-text-3 shrink-0" />
            ) : (
              <ChevronRightIcon className="h-3.5 w-3.5 text-ds-text-3 shrink-0" />
            )}
            <span className="truncate">{row.categoryName}</span>
            <span className="text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4 shrink-0">
              ({row.items.length})
            </span>
          </button>
        </td>
        {row.values.map((v) => {
          const cellKey = `${row.categoryId ?? "_"}_${v.bucketKey}`;
          const actual = actualByCellKey?.has(cellKey)
            ? (actualByCellKey.get(cellKey) ?? null)
            : null;
          const variance = actual !== null ? actual - v.amount : null;

          // ¿Algún item de la fila tiene IPC pendiente en este bucket?
          // Si sí, marcamos la celda agregada para que el usuario lo vea
          // aunque tenga la fila colapsada.
          const hasIpcInBucket =
            ipcPending && ipcPending.size > 0
              ? row.items.some((it) =>
                  ipcPending.has(`${it.itemId}_${v.bucketKey}`),
                )
              : false;

          const agg = aggregateRowStatus(row, v.bucketKey);
          const cellContent = (
            <div className="relative inline-flex items-center justify-end gap-1">
              {hasIpcInBucket && (
                <TrendingUp
                  className="h-3 w-3 text-status-warn-fg shrink-0"
                  aria-label="Reajuste IPC pendiente este mes"
                />
              )}
              <CellAmount
                projected={v.amount}
                actual={actual}
                variance={variance}
                kind={row.kind as "INCOME" | "EXPENSE"}
                cellStatus={agg.cellStatus}
                daysOverdue={agg.daysOverdue}
              />
            </div>
          );

          const aggregatedTarget = findAggregatedTarget(v.bucketKey);
          return (
            <DroppableBucketCell
              key={v.bucketKey}
              bucketKey={v.bucketKey}
              className={`p-2 text-right text-ds-text-2 whitespace-nowrap ${
                hasIpcInBucket
                  ? "bg-status-warn-soft ring-1 ring-status-warn-border"
                  : ""
              }`}
            >
              <CellActionPopover
                target={aggregatedTarget}
                granularity={granularity}
                onActionDone={onActionDoneSafe}
              >
                {cellContent}
              </CellActionPopover>
            </DroppableBucketCell>
          );
        })}
        <td className="hidden sm:table-cell sticky right-0 z-20 p-2 text-right font-mono bg-card whitespace-nowrap border-l border-border/50">
          {fmt.format(row.total)}
        </td>
      </tr>

      {expanded &&
        (() => {
          // Agrupamos SIEMPRE por cliente (crmAccountName): cada cuenta CRM
          // tiene su header con ícono de edificio y es colapsable. Items sin
          // cuenta (huérfanos / manuales sin vincular) van planos en el grupo
          // "—" sin sub-header.
          type Item = (typeof row.items)[number];
          const groups: Array<{ name: string; items: Item[] }> = [];
          const order: string[] = [];
          const byName = new Map<string, Item[]>();
          for (const it of row.items) {
            const key = it.crmAccountName ?? "—";
            if (!byName.has(key)) {
              byName.set(key, []);
              order.push(key);
            }
            byName.get(key)!.push(it);
          }
          for (const name of order) {
            groups.push({ name, items: byName.get(name)! });
          }
          const out: React.ReactNode[] = [];
          for (const g of groups) {
            // "—" = items sin cuenta CRM: van directos sin sub-header.
            if (g.name === "—") {
              for (const it of g.items) {
                out.push(
                  <ItemDetailRow
                    key={it.itemId}
                    item={it}
                    buckets={buckets}
                    granularity={granularity}
                    kind={row.kind as "INCOME" | "EXPENSE"}
                    ipcPending={ipcPending}
                    onActionDone={onActionDoneSafe}
                  />,
                );
              }
              continue;
            }
            // Cuenta CRM (1+ contratos): sub-header colapsable con total agregado.
            const groupTotalsByBucket = new Map<string, number>();
            for (const it of g.items) {
              for (const v of it.values) {
                groupTotalsByBucket.set(
                  v.bucketKey,
                  (groupTotalsByBucket.get(v.bucketKey) ?? 0) + v.amount,
                );
              }
            }
            const groupTotal = g.items.reduce((s, it) => s + it.total, 0);
            out.push(
              <ClientGroup
                key={`grp-${row.categoryCode}-${g.name}`}
                categoryCode={row.categoryCode}
                name={g.name}
                items={g.items}
                totalsByBucket={groupTotalsByBucket}
                buckets={buckets}
                grandTotal={groupTotal}
                granularity={granularity}
                kind={row.kind as "INCOME" | "EXPENSE"}
                ipcPending={ipcPending}
                onActionDone={onActionDoneSafe}
              />,
            );
          }
          return out;
        })()}
    </>
  );
}

const GROUP_STORAGE_PREFIX = "cashflow.group.collapsed.";

function isGroupCollapsed(categoryCode: string, name: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      window.localStorage.getItem(
        `${GROUP_STORAGE_PREFIX}${categoryCode}.${name}`,
      ) === "1"
    );
  } catch {
    return false;
  }
}

function setGroupCollapsed(
  categoryCode: string,
  name: string,
  collapsed: boolean,
) {
  if (typeof window === "undefined") return;
  try {
    const key = `${GROUP_STORAGE_PREFIX}${categoryCode}.${name}`;
    if (collapsed) {
      window.localStorage.setItem(key, "1");
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

/**
 * Header colapsable + items de una cuenta CRM. Default expandido (muestra
 * todas las instalaciones); el usuario puede colapsar y solo ve el header
 * con el total agregado por bucket. Estado persiste en localStorage por
 * (categoryCode, accountName).
 */
function ClientGroup({
  categoryCode,
  name,
  items,
  totalsByBucket,
  buckets,
  grandTotal,
  granularity,
  kind,
  ipcPending,
  onActionDone,
}: {
  categoryCode: string;
  name: string;
  items: import("@/modules/finance/cashflow/types").ProjectionRowItemDetail[];
  totalsByBucket: Map<string, number>;
  buckets: ProjectionBucket[];
  grandTotal: number;
  granularity: "weekly" | "monthly";
  kind: "INCOME" | "EXPENSE";
  ipcPending?: Map<string, Array<{ id: string; dueDate: string }>>;
  onActionDone: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(isGroupCollapsed(categoryCode, name));
  }, [categoryCode, name]);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      setGroupCollapsed(categoryCode, name, next);
      return next;
    });
  }, [categoryCode, name]);

  const count = items.length;
  const label = count === 1 ? "1 contrato" : `${count} contratos`;

  // Suma del monto base por moneda. En la práctica un cliente tiene todos
  // sus contratos en UF o todos en CLP (mezcla es rarísima), pero si pasa
  // mostramos ambos para no esconder valor.
  const baseByCurrency: Record<string, number> = {};
  for (const it of items) {
    if (it.baseAmount > 0) {
      baseByCurrency[it.currency] =
        (baseByCurrency[it.currency] ?? 0) + it.baseAmount;
    }
  }
  const baseLabel = (() => {
    const parts: string[] = [];
    if (baseByCurrency.UF) {
      parts.push(
        `UF ${new Intl.NumberFormat("es-CL", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(baseByCurrency.UF)}/mes`,
      );
    }
    if (baseByCurrency.CLP) {
      parts.push(`$${fmt.format(baseByCurrency.CLP)}/mes`);
    }
    return parts.join(" + ");
  })();

  // Dotación total: sumamos por instalación ÚNICA. Si dos contratos del
  // mismo cliente comparten instalación, la dotación de esa instalación
  // se cuenta una sola vez (no es por contrato, es por instalación
  // física). Items sin installationId no aportan.
  const headcountByInstallation = new Map<string, number>();
  for (const it of items) {
    if (it.installationId && it.headcount > 0) {
      headcountByInstallation.set(it.installationId, it.headcount);
    }
  }
  let totalHeadcount = 0;
  for (const h of headcountByInstallation.values()) totalHeadcount += h;

  return (
    <>
      <tr className="bg-primary/5 border-t-2 border-primary/30">
        <td className="sticky left-0 z-20 bg-card p-2 truncate min-w-[140px] max-w-[160px] sm:min-w-[180px] sm:max-w-none border-r border-border/50">
          <button
            type="button"
            onClick={toggle}
            className="flex items-center gap-1.5 w-full text-left pl-3 min-h-[32px]"
            title={collapsed ? "Expandir" : "Colapsar"}
          >
            {collapsed ? (
              <ChevronRightIcon className="h-3.5 w-3.5 text-ds-text-3 shrink-0" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-ds-text-3 shrink-0" />
            )}
            <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
            <span
              className="text-[12px] font-semibold text-ds-text-1 truncate"
              title={name}
            >
              {name}
            </span>
            <span className="text-[10px] font-mono uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-ds-sm bg-primary/15 text-primary shrink-0">
              {label}
            </span>
            {baseLabel ? (
              <span
                className="text-[11px] font-mono tabular-nums text-ds-text-3 shrink-0"
                title="Suma de montos base de los contratos del cliente"
              >
                · {baseLabel}
              </span>
            ) : null}
            {totalHeadcount > 0 ? (
              <span
                className="text-[11px] font-mono tabular-nums text-ds-text-3 shrink-0"
                title="Dotación total del cliente (suma por instalación única, evita duplicar cuando dos contratos comparten instalación)"
              >
                · {totalHeadcount} {totalHeadcount === 1 ? "persona" : "personas"}
              </span>
            ) : null}
          </button>
        </td>
        {buckets.map((b) => {
          const amount = totalsByBucket.get(b.key) ?? 0;
          const hasIpc =
            ipcPending && ipcPending.size > 0
              ? items.some((it) => ipcPending.has(`${it.itemId}_${b.key}`))
              : false;
          return (
            <td
              key={b.key}
              className={`p-2 text-right font-mono text-[12px] tabular-nums text-ds-text-2 whitespace-nowrap ${
                hasIpc
                  ? "bg-status-warn-soft ring-1 ring-status-warn-border"
                  : ""
              }`}
            >
              <span className="inline-flex items-center justify-end gap-1">
                {hasIpc && (
                  <TrendingUp
                    className="h-3 w-3 text-status-warn-fg"
                    aria-label="Reajuste IPC pendiente este mes"
                  />
                )}
                {amount > 0 ? fmt.format(amount) : "—"}
              </span>
            </td>
          );
        })}
        <td className="hidden sm:table-cell sticky right-0 z-20 p-2 text-right font-mono text-[12px] font-semibold tabular-nums bg-card whitespace-nowrap border-l border-border/50">
          {fmt.format(grandTotal)}
        </td>
      </tr>
      {!collapsed &&
        items.map((it) => (
          <ItemDetailRow
            key={it.itemId}
            item={it}
            buckets={buckets}
            granularity={granularity}
            kind={kind}
            ipcPending={ipcPending}
            onActionDone={onActionDone}
            inGroup
          />
        ))}
    </>
  );
}
