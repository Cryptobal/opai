"use client";
import { useCallback } from "react";
import { CellStatusPill, pillVariantFor } from "./CellStatusPill";
import type {
  ProjectionRowItemDetail,
  ProjectionRowItemValue,
  ProjectionBucket,
  ProjectionRow,
} from "@/modules/finance/cashflow/types";
import type { DrawerItemTarget } from "./CashflowItemDrawer";
import { fmtCompact } from "./cashflow-mobile-3w-helpers";

interface Props {
  item: ProjectionRowItemDetail;
  row: ProjectionRow;
  kind: "INCOME" | "EXPENSE";
  canManage: boolean;
  buckets: [ProjectionBucket | null, ProjectionBucket | null, ProjectionBucket | null];
  onTapCell: (target: DrawerItemTarget) => void;
}

function MobileCell({
  value,
  bucket,
  isActive,
  onTap,
}: {
  value: ProjectionRowItemValue | undefined;
  bucket: ProjectionBucket | null;
  isActive: boolean;
  onTap: () => void;
}) {
  if (!bucket) return <div />;

  const activeBg = isActive ? "bg-status-info-bg/10" : "";

  if (!value || value.amount === 0) {
    return (
      <div className={`text-right text-[11px] text-ds-text-3 py-1 px-1.5 rounded-sm ${activeBg}`}>
        —
      </div>
    );
  }

  const dtes = value.dtes ?? [];
  const pills = dtes.length === 0
    ? [pillVariantFor({ cellStatus: value.cellStatus ?? "PROJECTED" })]
    : dtes.slice(0, 2).map((d) => pillVariantFor({
        cellStatus: d.cellStatus,
        hasFactoring: d.hasFactoring,
        daysOverdue: d.daysOverdue,
        voided: !!d.voidedByCreditNoteId,
      }));

  return (
    <button
      type="button"
      onClick={onTap}
      className={`text-right py-1 px-1.5 rounded-sm transition-colors ${activeBg} hover:bg-muted/40 active:bg-muted/60`}
    >
      <div className="text-[11px] tabular-nums font-medium">
        {fmtCompact(value.amount)}
      </div>
      <div className="flex justify-end gap-0.5 mt-0.5">
        {pills.map((v, i) => (
          <CellStatusPill key={i} variant={v} compact />
        ))}
      </div>
    </button>
  );
}

function buildTarget(
  item: ProjectionRowItemDetail,
  row: ProjectionRow,
  kind: "INCOME" | "EXPENSE",
  canManage: boolean,
  bucket: ProjectionBucket,
  v: ProjectionRowItemValue | undefined,
): DrawerItemTarget {
  return {
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
    bucketKey: bucket.key,
    amountClp: v?.amount ?? 0,
    actualAmountClp: v?.actualAmount ?? null,
    scheduledDate: v?.scheduledDate ?? "",
    occurrenceId: v?.occurrenceId ?? null,
    categoryName: row.categoryName,
    kind,
    canManage,
    cellStatus: v?.cellStatus,
    dteId: v?.dteId ?? null,
    dteFolio: v?.dteFolio ?? null,
    daysOverdue: v?.daysOverdue,
  };
}

export function CashflowMobileWeeklyRow({ item, row, kind, canManage, buckets, onTapCell }: Props) {
  const [prev, active, next] = buckets;
  const valuesByKey = new Map(item.values.map((v) => [v.bucketKey, v]));
  const display = item.nickname ?? item.installationName ?? item.itemName;

  const tapForBucket = useCallback(
    (bucket: ProjectionBucket | null) => {
      if (!bucket || item.itemId === "_orphan") return;
      const v = valuesByKey.get(bucket.key);
      onTapCell(buildTarget(item, row, kind, canManage, bucket, v));
    },
    [item, row, kind, canManage, valuesByKey, onTapCell],
  );

  return (
    <div
      className="grid items-center px-2 py-1.5 pl-3 border-b border-border/50"
      style={{ gridTemplateColumns: "minmax(0, 1.5fr) repeat(3, minmax(0, 1fr))" }}
    >
      <div className="min-w-0 pl-3">
        <div className="text-[11px] font-medium truncate">{display}</div>
      </div>
      <MobileCell
        value={prev ? valuesByKey.get(prev.key) : undefined}
        bucket={prev}
        isActive={false}
        onTap={() => tapForBucket(prev)}
      />
      <MobileCell
        value={active ? valuesByKey.get(active.key) : undefined}
        bucket={active}
        isActive={true}
        onTap={() => tapForBucket(active)}
      />
      <MobileCell
        value={next ? valuesByKey.get(next.key) : undefined}
        bucket={next}
        isActive={false}
        onTap={() => tapForBucket(next)}
      />
    </div>
  );
}
