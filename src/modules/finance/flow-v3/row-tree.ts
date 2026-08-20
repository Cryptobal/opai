/**
 * Árbol de un nivel para renglones GAV/OTROS (categoría → subfilas).
 * Puro: lo usan el matrix, la planilla y los tests.
 */
import { computeCellExecution } from "./residual";
import type { FlowMatrixCellDto } from "./matrix-assemble";

export const SUBROW_SECTIONS = new Set(["GAV", "OTROS"]);

export interface FlowTreeRowRef {
  id: string;
  name: string;
  section?: string | null;
  parentId?: string | null;
  canonicalKey?: string | null;
  isVirtual?: boolean;
  isArchived?: boolean;
  mapping?: string | null;
}

export function canHaveSubRows(row: FlowTreeRowRef): boolean {
  if (row.isVirtual || row.isArchived) return false;
  if (row.parentId) return false;
  if (row.canonicalKey) return false;
  if (!row.section || !SUBROW_SECTIONS.has(row.section)) return false;
  return true;
}

export function nestFlowRows<T extends { id: string; name: string; parentId?: string | null; orderIndex?: number }>(
  rows: T[],
): Array<T & { childCount: number }> {
  const byParent = new Map<string, T[]>();
  const roots: T[] = [];
  for (const r of rows) {
    if (r.parentId) {
      const list = byParent.get(r.parentId) ?? [];
      list.push(r);
      byParent.set(r.parentId, list);
    } else {
      roots.push(r);
    }
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => {
      const ao = a.orderIndex;
      const bo = b.orderIndex;
      if (typeof ao === "number" && typeof bo === "number" && ao !== bo) return ao - bo;
      return a.name.localeCompare(b.name, "es", { sensitivity: "base", numeric: true });
    });
  }
  const out: Array<T & { childCount: number }> = [];
  const placed = new Set<string>();
  for (const root of roots) {
    const kids = byParent.get(root.id) ?? [];
    out.push({ ...root, childCount: kids.length });
    placed.add(root.id);
    for (const child of kids) {
      out.push({ ...child, childCount: 0 });
      placed.add(child.id);
    }
  }
  // Huérfanos (padre fuera de la ventana): se muestran como raíz.
  for (const r of rows) {
    if (placed.has(r.id)) continue;
    out.push({ ...r, childCount: 0 });
  }
  return out;
}

export function rollupCollapsedCells(
  parent: { section: string; canonicalKey?: string | null; cells: FlowMatrixCellDto[] },
  children: Array<{ cells: FlowMatrixCellDto[] }>,
): FlowMatrixCellDto[] {
  return parent.cells.map((own, i) => {
    const kids = children.map((c) => c.cells[i]).filter(Boolean) as FlowMatrixCellDto[];
    const plan = (own.plan ?? 0) + kids.reduce((s, c) => s + (c.plan ?? 0), 0);
    const effective = (own.effective ?? 0) + kids.reduce((s, c) => s + (c.effective ?? 0), 0);
    const committedTotal =
      (own.committed?.total ?? 0) + kids.reduce((s, c) => s + (c.committed?.total ?? 0), 0);
    const realSigned =
      (own.real?.total ?? 0) + kids.reduce((s, c) => s + (c.real?.total ?? 0), 0);
    const committedItems = [
      ...(own.committed?.items ?? []),
      ...kids.flatMap((c) => c.committed?.items ?? []),
    ];
    const realItems = [
      ...(own.real?.items ?? []),
      ...kids.flatMap((c) => c.real?.items ?? []),
    ];
    let layer: FlowMatrixCellDto["layer"] = "empty";
    if (realSigned !== 0) layer = "real";
    else if (plan !== 0) layer = "plan";
    else if (committedTotal !== 0) layer = "committed";

    const computed = computeCellExecution({
      section: parent.section,
      plan,
      committedTotal,
      committedNet: 0,
      invoiced: false,
      realSigned,
      settlement: "AUTO",
      residualCarryEnabled: true,
      residualMinClp: 10_000,
      canonicalKey: parent.canonicalKey,
    });

    return {
      ...own,
      plan,
      effective,
      layer,
      committed:
        committedTotal !== 0 ? { total: committedTotal, items: committedItems } : null,
      real: realSigned !== 0 ? { total: realSigned, items: realItems } : null,
      execution: computed.execution,
      projected: plan !== 0 ? Math.abs(plan) : computed.execution.projected || null,
    };
  });
}

export function applySubrowVisibility<
  T extends {
    id: string;
    name: string;
    parentId?: string | null;
    cells: FlowMatrixCellDto[];
    section: string;
    canonicalKey?: string | null;
  },
>(args: {
  all: T[];
  filtered: T[];
  expandedIds: Set<string>;
  searchActive: boolean;
}): { rows: Array<T & { childCount: number }>; rolledUpIds: Set<string> } {
  const filteredIds = new Set(args.filtered.map((r) => r.id));
  const byId = new Map(args.all.map((r) => [r.id, r]));
  const extra: T[] = [];
  for (const r of args.filtered) {
    if (r.parentId && !filteredIds.has(r.parentId)) {
      const parent = byId.get(r.parentId);
      if (parent) {
        extra.push(parent);
        filteredIds.add(parent.id);
      }
    }
  }
  let rows: T[] = extra.length ? [...args.filtered, ...extra] : args.filtered;

  const searchExpand = new Set<string>();
  if (args.searchActive) {
    for (const r of rows) {
      if (r.parentId) searchExpand.add(r.parentId);
    }
  }

  rows = rows.filter((r) => {
    if (!r.parentId) return true;
    return args.expandedIds.has(r.parentId) || searchExpand.has(r.parentId);
  });

  const nested = nestFlowRows(rows);
  const childrenByParent = new Map<string, T[]>();
  for (const r of args.all) {
    if (!r.parentId) continue;
    const list = childrenByParent.get(r.parentId) ?? [];
    list.push(r);
    childrenByParent.set(r.parentId, list);
  }

  const rolledUpIds = new Set<string>();
  const out = nested.map((r) => {
    const kids = childrenByParent.get(r.id) ?? [];
    const expanded = args.expandedIds.has(r.id) || searchExpand.has(r.id);
    if (!r.parentId && kids.length > 0 && !expanded) {
      rolledUpIds.add(r.id);
      return { ...r, cells: rollupCollapsedCells(r, kids) };
    }
    return r;
  });
  return { rows: out, rolledUpIds };
}
