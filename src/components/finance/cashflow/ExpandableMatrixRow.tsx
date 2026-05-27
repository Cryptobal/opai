"use client";
import type React from "react";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight as ChevronRightIcon, TrendingUp } from "lucide-react";
import type {
  ProjectionRow,
  ProjectionBucket,
} from "@/modules/finance/cashflow/types";
import { useDroppable } from "@dnd-kit/core";
import { ItemDetailRow } from "./ItemDetailRow";
import { ClientGroupHeader } from "./ClientGroupHeader";

const fmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

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
  /** Mapa de montos reales conciliados — no se usa en la fila agregada
   *  (que muestra suma proyectada pura). Lo recibimos solo por compat
   *  con la API anterior; los descendientes ya leen sus actuales del
   *  `row.items[i].values[j].actualAmount`. */
  actualByCellKey?: Map<string, number>;
  /** Ajustes IPC PENDING indexados por `${itemId}_${bucketKey}`. La celda
   *  con marker muestra un mini-badge ámbar para que el reajuste no se
   *  pase de fecha. */
  ipcPending?: Map<string, Array<{ id: string; dueDate: string }>>;
  buckets: ProjectionBucket[];
  granularity: "weekly" | "monthly";
  /** Cuando es "amount_desc" los items y los grupos por cliente dentro
   *  de la categoría se ordenan también por total descendente. */
  rowOrder?: "default" | "alpha" | "amount_desc";
  onActionDone?: () => void;
}

/**
 * Fila de categoría con chevron para expandir y ver el desglose por item
 * (instalación / contrato / template). El estado expandido persiste en
 * localStorage por categoryId.
 */
export function ExpandableMatrixRow({
  row,
  // actualByCellKey: aceptado pero no usado en la fila agregada (la suma
  // proyectada se muestra sin override/delta — ese formato vive en los
  // ItemDetailRow). Quedó en Props por compat con WeeklyMatrix/MonthlyMatrix.
  actualByCellKey: _actualByCellKey,
  ipcPending,
  buckets,
  granularity,
  rowOrder = "default",
  onActionDone,
}: Props) {
  void _actualByCellKey;
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
  const onActionDoneSafe = onActionDone ?? (() => {});

  return (
    <>
      <tr className="hover:bg-muted/20">
        <td className="sticky left-0 z-20 bg-card p-2 truncate min-w-[140px] max-w-[200px] sm:min-w-[180px] sm:max-w-[260px] border-r border-border/50">
          <button
            type="button"
            onClick={toggle}
            className="flex items-start gap-1.5 w-full text-left min-h-[44px] sm:min-h-0"
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-ds-text-3 shrink-0 mt-0.5" />
            ) : (
              <ChevronRightIcon className="h-3.5 w-3.5 text-ds-text-3 shrink-0 mt-0.5" />
            )}
            <span
              className="line-clamp-2 break-words flex-1 min-w-0"
              title={row.categoryName}
            >
              {row.categoryName}
            </span>
            <span className="text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4 shrink-0 mt-0.5">
              ({row.items.length})
            </span>
          </button>
        </td>
        {row.values.map((v) => {
          // ¿Algún item de la fila tiene IPC pendiente en este bucket?
          // Marcamos la celda agregada para que el usuario lo vea aunque
          // tenga la fila colapsada.
          const hasIpcInBucket =
            ipcPending && ipcPending.size > 0
              ? row.items.some((it) =>
                  ipcPending.has(`${it.itemId}_${v.bucketKey}`),
                )
              : false;

          // Fila AGREGADA de categoría: mostramos SOLO la suma proyectada
          // como texto plano. Nada de tachado/override/delta/status — esos
          // formatos viven en el ItemDetailRow del contrato individual.
          // Si el usuario quiere ver el detalle, expande la categoría.
          const cellContent = (
            <span className="inline-flex items-center justify-end gap-1 font-mono tabular-nums">
              {hasIpcInBucket && (
                <TrendingUp
                  className="h-3 w-3 text-status-warn-fg shrink-0"
                  aria-label="Reajuste IPC pendiente este mes"
                />
              )}
              {v.amount > 0 ? fmt.format(v.amount) : "—"}
            </span>
          );

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
              {cellContent}
            </DroppableBucketCell>
          );
        })}
        <td className="hidden sm:table-cell sticky right-0 z-20 p-2 text-right font-mono bg-card whitespace-nowrap border-l border-border/50">
          {fmt.format(row.total)}
        </td>
      </tr>

      {expanded &&
        (() => {
          type Item = (typeof row.items)[number];
          const groups: Array<{ name: string; items: Item[]; total: number }> = [];
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
            const items = byName.get(name)!;
            groups.push({
              name,
              items,
              total: items.reduce((s, it) => s + it.total, 0),
            });
          }
          if (rowOrder === "amount_desc") {
            groups.sort((a, b) => b.total - a.total);
            for (const g of groups) {
              g.items = [...g.items].sort((a, b) => b.total - a.total);
            }
          }
          const colSpan = buckets.length + 2;
          const out: React.ReactNode[] = [];
          for (const g of groups) {
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
            const baseByCurrency: Record<string, number> = {};
            for (const it of g.items) {
              if (it.baseAmount > 0) {
                baseByCurrency[it.currency] =
                  (baseByCurrency[it.currency] ?? 0) + it.baseAmount;
              }
            }
            const fmtLocal = new Intl.NumberFormat("es-CL", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            });
            const parts: string[] = [];
            if (baseByCurrency.UF) parts.push(`UF ${fmtLocal.format(baseByCurrency.UF)}/mes`);
            if (baseByCurrency.CLP) parts.push(`$${fmt.format(baseByCurrency.CLP)}/mes`);
            const monthlyLabel = parts.length > 0 ? parts.join(" + ") : null;

            out.push(
              <ClientGroupHeader
                key={`grp-${row.categoryCode}-${g.name}`}
                clientName={g.name}
                installationCount={g.items.length}
                monthlyAmountLabel={monthlyLabel}
                colSpan={colSpan}
              />,
            );
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
                  inGroup
                />,
              );
            }
          }
          return out;
        })()}
    </>
  );
}


