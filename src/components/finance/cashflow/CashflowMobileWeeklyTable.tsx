"use client";
import { Fragment, useState, useMemo } from "react";
import type {
  ProjectionMatrix,
  ProjectionRowItemDetail,
  ProjectionBucket,
  ProjectionRow,
} from "@/modules/finance/cashflow/types";
import type { DrawerItemTarget } from "./CashflowItemDrawer";
import { CashflowMobileWeeklyHeader } from "./CashflowMobileWeeklyHeader";
import { CashflowMobileWeeklyBand } from "./CashflowMobileWeeklyBand";
import { CashflowMobileWeeklyRow } from "./CashflowMobileWeeklyRow";
import { getTriplet } from "./cashflow-mobile-3w-helpers";

interface Props {
  projection: ProjectionMatrix;
  activeBucketKey: string | null;
  canManage: boolean;
  onTapCell: (target: DrawerItemTarget) => void;
}

function sumForBucket(items: ProjectionRowItemDetail[], key: string | undefined): number {
  if (!key) return 0;
  let s = 0;
  for (const it of items) {
    const v = it.values.find((x) => x.bucketKey === key);
    if (v) s += v.amount;
  }
  return s;
}

function groupByClient(items: ProjectionRowItemDetail[]) {
  const groups: { id: string; name: string; items: ProjectionRowItemDetail[] }[] = [];
  const idx = new Map<string, number>();
  for (const it of items) {
    const id = it.crmAccountId ?? "_no_client";
    const name = it.crmAccountName ?? "Sin cliente";
    let i = idx.get(id);
    if (i === undefined) {
      i = groups.length;
      idx.set(id, i);
      groups.push({ id, name, items: [] });
    }
    groups[i].items.push(it);
  }
  return groups;
}

export function CashflowMobileWeeklyTable({
  projection, activeBucketKey, canManage, onTapCell,
}: Props) {
  const { prev, active, next } = getTriplet(projection.buckets, activeBucketKey);
  // Estado: set de keys de categorías abiertas. Default vacío = todas
  // contraídas. El usuario expande manualmente las que le interesan
  // — coherente con el comportamiento del desktop (ExpandableMatrixRow
  // con `useState(false)` por categoría).
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const isOpen = (k: string) => openCats.has(k);
  function toggleCat(k: string) {
    setOpenCats((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  }

  const incomeRoots = useMemo(
    () => projection.rows.filter((r) => r.kind === "INCOME"),
    [projection.rows],
  );
  const expenseRoots = useMemo(
    () => projection.rows.filter((r) => r.kind === "EXPENSE"),
    [projection.rows],
  );

  function bandValues(items: ProjectionRowItemDetail[]): [number, number, number] {
    return [
      sumForBucket(items, prev?.key),
      sumForBucket(items, active?.key),
      sumForBucket(items, next?.key),
    ];
  }

  const allIncome = useMemo(() => incomeRoots.flatMap((r) => r.items ?? []), [incomeRoots]);
  const allExpense = useMemo(() => expenseRoots.flatMap((r) => r.items ?? []), [expenseRoots]);
  const ingresosBand = bandValues(allIncome);
  const egresosBand = bandValues(allExpense).map((v) => -Math.abs(v)) as [number, number, number];

  const cumByKey = useMemo(
    () => new Map(projection.cumulativeBalances.map((p) => [p.bucketKey, p.balanceClp])),
    [projection.cumulativeBalances],
  );
  const saldoBand: [number, number, number] = [
    prev ? cumByKey.get(prev.key) ?? 0 : 0,
    active ? cumByKey.get(active.key) ?? 0 : 0,
    next ? cumByKey.get(next.key) ?? 0 : 0,
  ];

  return (
    <div className="overflow-x-hidden bg-card rounded-ds-lg border border-border">
      <CashflowMobileWeeklyHeader prev={prev} active={active} next={next} />
      <CashflowMobileWeeklyBand label="INGRESOS" tone="income" values={ingresosBand} />
      {incomeRoots.map((root) => {
        const items = root.items ?? [];
        if (items.length === 0) return null;
        const k = `INCOME:${root.categoryCode}`;
        const open = isOpen(k);
        return (
          <Fragment key={k}>
            <CashflowMobileWeeklyBand
              label={root.categoryName}
              tone="subcat"
              values={bandValues(items)}
              collapsible
              expanded={open}
              onToggle={() => toggleCat(k)}
            />
            {open && groupByClient(items).map((g) => (
              <Fragment key={g.id}>
                <CashflowMobileWeeklyBand
                  label={g.name}
                  tone="client"
                  installationCount={g.items.length}
                />
                {g.items.map((it) => (
                  <CashflowMobileWeeklyRow
                    key={it.itemId}
                    item={it}
                    row={root}
                    kind="INCOME"
                    canManage={canManage}
                    buckets={[prev, active, next]}
                    onTapCell={onTapCell}
                  />
                ))}
              </Fragment>
            ))}
          </Fragment>
        );
      })}
      <CashflowMobileWeeklyBand label="EGRESOS" tone="expense" values={egresosBand} />
      {expenseRoots.map((root) => {
        const items = root.items ?? [];
        if (items.length === 0) return null;
        const k = `EXPENSE:${root.categoryCode}`;
        const open = isOpen(k);
        return (
          <Fragment key={k}>
            <CashflowMobileWeeklyBand
              label={root.categoryName}
              tone="subcat"
              values={bandValues(items)}
              collapsible
              expanded={open}
              onToggle={() => toggleCat(k)}
            />
            {open && items.map((it) => (
              <CashflowMobileWeeklyRow
                key={it.itemId}
                item={it}
                row={root}
                kind="EXPENSE"
                canManage={canManage}
                buckets={[prev, active, next]}
                onTapCell={onTapCell}
              />
            ))}
          </Fragment>
        );
      })}
      <div className="sticky bottom-0 z-10 bg-card border-t border-border">
        <CashflowMobileWeeklyBand label="SALDO ACUM." tone="saldo" values={saldoBand} />
      </div>
    </div>
  );
}
