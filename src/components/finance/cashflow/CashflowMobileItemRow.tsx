"use client";
import { useState, useEffect, useMemo, useCallback, memo } from "react";
import { ChevronDown, ChevronRight, Building2, TrendingUp } from "lucide-react";
import type {
  ProjectionRow,
  ProjectionRowItemDetail,
} from "@/modules/finance/cashflow/types";
import { fmt, StatusBadge } from "./MatrixHelpers";
import {
  SOURCE_BADGE,
  getStoredExpanded,
  setStoredExpanded,
} from "./cashflow-mobile-helpers";
import type { DrawerItemTarget } from "./CashflowItemDrawer";

interface CategoryGroupProps {
  row: ProjectionRow;
  bucketKey: string;
  kind: "INCOME" | "EXPENSE";
  canManage: boolean;
  onOpenItem: (t: DrawerItemTarget) => void;
}

export const CategoryGroup = memo(function CategoryGroup({
  row,
  bucketKey,
  kind,
  canManage,
  onOpenItem,
}: CategoryGroupProps) {
  // Default = expandido: en móvil queremos que al abrir Ingresos/Egresos se
  // vean TODOS los ítems de una. La hidratación desde localStorage sólo
  // colapsa categorías que el usuario marcó explícitamente como colapsadas.
  const [expanded, setExpanded] = useState(true);
  useEffect(() => {
    setExpanded(getStoredExpanded(row.categoryId));
  }, [row.categoryId]);

  function toggle() {
    setExpanded((prev) => {
      const next = !prev;
      setStoredExpanded(row.categoryId, next);
      return next;
    });
  }

  const bucketValue = row.values.find((v) => v.bucketKey === bucketKey);
  const amount = bucketValue?.amount ?? 0;

  // Items con monto > 0 en el bucket o con occurrence materializada.
  const itemsInBucket = useMemo(
    () =>
      row.items.filter((it) =>
        it.values.some(
          (v) =>
            v.bucketKey === bucketKey &&
            (v.amount > 0 || v.occurrenceId !== null),
        ),
      ),
    [row.items, bucketKey],
  );

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between gap-2 px-3 py-3 min-h-[48px] hover:bg-muted/20 text-left"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-1.5 min-w-0 flex-1">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-ds-text-3 shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-ds-text-3 shrink-0" />
          )}
          <span className="text-[13px] font-medium text-ds-text-1 truncate">
            {row.categoryName}
          </span>
          <span className="text-[10px] font-mono uppercase tracking-wider text-ds-text-4 shrink-0">
            ({itemsInBucket.length})
          </span>
        </span>
        <span
          className={`text-[13px] font-mono font-semibold tabular-nums shrink-0 ${
            kind === "INCOME" ? "text-status-ok-fg" : "text-status-warn-fg"
          }`}
        >
          {fmt.format(amount)}
        </span>
      </button>

      {expanded && itemsInBucket.length > 0 && (
        <ItemGroups
          row={row}
          itemsInBucket={itemsInBucket}
          bucketKey={bucketKey}
          kind={kind}
          canManage={canManage}
          onOpenItem={onOpenItem}
        />
      )}
    </div>
  );
});

function ItemGroups({
  row,
  itemsInBucket,
  bucketKey,
  kind,
  canManage,
  onOpenItem,
}: {
  row: ProjectionRow;
  itemsInBucket: ProjectionRowItemDetail[];
  bucketKey: string;
  kind: "INCOME" | "EXPENSE";
  canManage: boolean;
  onOpenItem: (t: DrawerItemTarget) => void;
}) {
  // Agrupamos por cliente CRM (mismo patrón que ExpandableMatrixRow). Items
  // sin cuenta CRM van planos en el grupo "—" sin sub-header.
  const groups = useMemo(() => {
    const byName = new Map<string, ProjectionRowItemDetail[]>();
    const order: string[] = [];
    for (const it of itemsInBucket) {
      const key = it.crmAccountName ?? "—";
      if (!byName.has(key)) {
        byName.set(key, []);
        order.push(key);
      }
      byName.get(key)!.push(it);
    }
    return order.map((name) => ({ name, items: byName.get(name)! }));
  }, [itemsInBucket]);

  return (
    <div className="bg-muted/10">
      {groups.map((g) =>
        g.name === "—" ? (
          g.items.map((it) => (
            <ItemRow
              key={it.itemId}
              item={it}
              row={row}
              bucketKey={bucketKey}
              kind={kind}
              canManage={canManage}
              onOpenItem={onOpenItem}
            />
          ))
        ) : (
          <ClientGroup
            key={g.name}
            name={g.name}
            items={g.items}
            row={row}
            bucketKey={bucketKey}
            kind={kind}
            canManage={canManage}
            onOpenItem={onOpenItem}
          />
        ),
      )}
    </div>
  );
}

function ClientGroup({
  name,
  items,
  row,
  bucketKey,
  kind,
  canManage,
  onOpenItem,
}: {
  name: string;
  items: ProjectionRowItemDetail[];
  row: ProjectionRow;
  bucketKey: string;
  kind: "INCOME" | "EXPENSE";
  canManage: boolean;
  onOpenItem: (t: DrawerItemTarget) => void;
}) {
  const subtotal = items.reduce((s, it) => {
    const v = it.values.find((x) => x.bucketKey === bucketKey);
    return s + (v?.amount ?? 0);
  }, 0);

  return (
    <div>
      <div className="flex items-center gap-1.5 px-3 py-2 bg-primary/5 border-t border-primary/20">
        <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
        <span
          className="text-[12px] font-semibold text-ds-text-1 truncate flex-1"
          title={name}
        >
          {name}
        </span>
        <span className="text-[12px] font-mono font-semibold tabular-nums text-ds-text-2">
          {fmt.format(subtotal)}
        </span>
      </div>
      {items.map((it) => (
        <ItemRow
          key={it.itemId}
          item={it}
          row={row}
          bucketKey={bucketKey}
          kind={kind}
          canManage={canManage}
          onOpenItem={onOpenItem}
          indent
        />
      ))}
    </div>
  );
}

const ItemRow = memo(function ItemRow({
  item,
  row,
  bucketKey,
  kind,
  canManage,
  onOpenItem,
  indent = false,
}: {
  item: ProjectionRowItemDetail;
  row: ProjectionRow;
  bucketKey: string;
  kind: "INCOME" | "EXPENSE";
  canManage: boolean;
  onOpenItem: (t: DrawerItemTarget) => void;
  indent?: boolean;
}) {
  const v = item.values.find((x) => x.bucketKey === bucketKey);
  const amount = v?.amount ?? 0;
  const actual = v?.actualAmount ?? null;
  // BLOQUE 5 / Fase 6: nickname tiene prioridad sobre installationName /
  // itemName cuando está configurado, igual que en ItemDetailRow desktop.
  const display = item.nickname ?? item.installationName ?? item.itemName;
  const badge = SOURCE_BADGE[item.source];

  const handleClick = useCallback(() => {
    if (item.itemId === "_orphan") return;
    onOpenItem({
      itemId: item.itemId,
      itemName: item.itemName,
      installationId: item.installationId,
      installationName: item.installationName,
      crmAccountId: item.crmAccountId,
      crmAccountName: item.crmAccountName,
      baseAmount: item.baseAmount,
      currency: item.currency,
      hasIpcAdjustment: item.hasIpcAdjustment,
      ipcAdjustmentMonths: item.ipcAdjustmentMonths,
      source: item.source,
      sourceRefCode: item.sourceRefCode,
      bucketKey,
      amountClp: amount,
      actualAmountClp: actual,
      scheduledDate: v?.scheduledDate ?? "",
      occurrenceId: v?.occurrenceId ?? null,
      categoryName: row.categoryName,
      kind,
      canManage,
      cellStatus: v?.cellStatus,
      dteId: v?.dteId ?? null,
      dteFolio: v?.dteFolio ?? null,
      daysOverdue: v?.daysOverdue,
    });
  }, [item, v, bucketKey, amount, actual, row.categoryName, kind, canManage, onOpenItem]);

  const toneCls =
    kind === "INCOME" ? "text-status-ok-fg" : "text-status-warn-fg";

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`w-full flex items-start justify-between gap-2 px-3 py-3 min-h-[56px] text-left hover:bg-muted/30 border-t border-border/40 ${
        indent ? "pl-8" : ""
      }`}
    >
      <div className="min-w-0 flex-1 flex flex-col gap-0.5">
        <span className="text-[13px] text-ds-text-1 truncate" title={display}>
          {display}
        </span>
        <div className="flex flex-wrap items-center gap-1">
          {badge && (
            <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-ds-sm bg-muted/40 text-ds-text-4">
              {badge}
            </span>
          )}
          {item.currency === "UF" && (
            <span className="text-[10px] font-mono font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-ds-sm bg-status-info-soft text-status-info-fg">
              UF
            </span>
          )}
          {item.hasIpcAdjustment && item.currency !== "UF" && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-ds-sm bg-status-warn-soft text-status-warn-fg">
              <TrendingUp className="h-2.5 w-2.5" />
              IPC
            </span>
          )}
          <StatusBadge
            status={v?.cellStatus}
            daysOverdue={v?.daysOverdue}
          />
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <span className={`text-[13px] font-mono font-semibold tabular-nums ${toneCls}`}>
          {fmt.format(amount)}
        </span>
        {actual !== null && actual !== 0 && (
          <span className="text-[10px] font-mono tabular-nums text-ds-text-3">
            real {fmt.format(actual)}
          </span>
        )}
      </div>
    </button>
  );
});
