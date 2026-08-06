"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Search } from "lucide-react";
import {
  EmptyState,
  Spinner,
  Surface,
  Tag,
} from "@/components/opai-ds";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { FlowHealthPanel } from "./FlowHealthPanel";
import type { FlowRowConfigItem } from "@/modules/finance/cashflow/flow-rows-config.service";
import { FLOW_SECTION_ORDER } from "@/modules/finance/flow-v3/row-sort";

type CategoryOption = {
  id: string;
  code: string;
  name: string;
  kind: "INCOME" | "EXPENSE";
};

type Props = {
  categories: CategoryOption[];
  onResolveAccount?: (accountPlanId: string) => void;
};

type SectionGroup = {
  key: string;
  rows: FlowRowConfigItem[];
};

/**
 * Tab Renglones: filas del flujo con categoría/cuentas + diagnóstico de salud
 * (absorbido desde el antiguo tab Salud).
 */
export function FlowRowsConfigPanel({ categories, onResolveAccount }: Props) {
  const [rows, setRows] = useState<FlowRowConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

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
        return;
      }
      setRows((j.data?.rows ?? []) as FlowRowConfigItem[]);
    } catch {
      setError("Error de red al cargar renglones");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const hay = [
        row.name,
        row.section,
        row.category?.code ?? "",
        row.category?.name ?? "",
        ...(row.category?.accounts.map((a) => `${a.code} ${a.name}`) ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query]);

  const groups = useMemo((): SectionGroup[] => {
    const bySection = new Map<string, FlowRowConfigItem[]>();
    for (const row of filtered) {
      const list = bySection.get(row.section);
      if (list) list.push(row);
      else bySection.set(row.section, [row]);
    }
    const known = new Set<string>(FLOW_SECTION_ORDER);
    const ordered: SectionGroup[] = [];
    for (const key of FLOW_SECTION_ORDER) {
      const sectionRows = bySection.get(key);
      if (sectionRows?.length) ordered.push({ key, rows: sectionRows });
    }
    for (const [key, sectionRows] of bySection) {
      if (!known.has(key) && sectionRows.length) {
        ordered.push({ key, rows: sectionRows });
      }
    }
    return ordered;
  }, [filtered]);

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
    patch: { name?: string; categoryId?: string | null },
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

  const expenseCats = categories.filter((c) => c.kind === "EXPENSE");

  return (
    <div className="space-y-5">
      <Surface elevation={1} padding="md">
        <h2 className="font-semibold mb-1">Renglones del flujo</h2>
        <p className="text-[12px] text-ds-text-3 mb-3">
          Cada renglón de la planilla puede vincularse a una categoría (y sus
          cuentas contables). Buscá por nombre, categoría o cuenta.
        </p>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ds-text-4" />
          <Input
            className="h-10 sm:h-9 pl-9"
            placeholder="Buscar renglón, categoría o cuenta…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-ds-text-3">
            <Spinner size="sm" />
            <span className="text-[13px]">Cargando renglones…</span>
          </div>
        ) : error ? (
          <EmptyState
            icon={AlertTriangle}
            title="No se pudo cargar"
            description={error}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={AlertTriangle}
            title="Sin coincidencias"
            description="Probá otro término o revisá la planilla de flujo."
          />
        ) : (
          <div className="space-y-3 ds-list-cascade">
            {groups.map((group) => {
              const isCollapsed = collapsed.has(group.key);
              return (
                <div
                  key={group.key}
                  className="rounded-ds-md border border-ds-border-default overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => toggleSection(group.key)}
                    className="flex w-full items-center gap-2 min-h-11 px-3 py-2.5 bg-ds-surface-2 text-left hover:bg-ds-surface-3 transition-colors"
                    aria-expanded={!isCollapsed}
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4 shrink-0 text-ds-text-3" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-ds-text-3" />
                    )}
                    <span className="font-semibold text-[13px] tracking-wide">
                      {group.key}
                    </span>
                    <Tag variant="neutral" size="sm">
                      {group.rows.length}
                    </Tag>
                  </button>
                  {!isCollapsed && (
                    <ul className="space-y-2 p-2 sm:p-3 border-t border-ds-border-subtle">
                      {group.rows.map((row) => (
                        <li
                          key={row.id}
                          className="rounded-ds-md border border-ds-border-default bg-ds-surface-1 p-3"
                        >
                          <div className="flex flex-wrap items-start gap-3">
                            <div className="min-w-0 flex-1 space-y-2">
                              {!row.category && (
                                <div className="flex flex-wrap items-center gap-2">
                                  <Tag variant="warn" size="sm">
                                    Sin categoría
                                  </Tag>
                                </div>
                              )}
                              <div>
                                <Label className="text-[12px] text-ds-text-3">
                                  Nombre
                                </Label>
                                <Input
                                  className="h-10 sm:h-9 mt-1"
                                  defaultValue={row.name}
                                  disabled={savingId === row.id}
                                  onBlur={(e) => {
                                    const next = e.target.value.trim();
                                    if (next && next !== row.name) {
                                      void patchRow(row.id, { name: next });
                                    }
                                  }}
                                />
                              </div>
                              <div>
                                <Label className="text-[12px] text-ds-text-3">
                                  Categoría
                                </Label>
                                <Select
                                  value={row.category?.id ?? "__none__"}
                                  onValueChange={(v) => {
                                    const categoryId =
                                      v === "__none__" ? null : v;
                                    if (
                                      categoryId !== (row.category?.id ?? null)
                                    ) {
                                      void patchRow(row.id, { categoryId });
                                    }
                                  }}
                                  disabled={savingId === row.id}
                                >
                                  <SelectTrigger className="h-10 sm:h-9 mt-1">
                                    <SelectValue placeholder="Sin categoría" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none__">
                                      Sin categoría
                                    </SelectItem>
                                    {expenseCats.map((c) => (
                                      <SelectItem key={c.id} value={c.id}>
                                        {c.code} · {c.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              {row.category &&
                                row.category.accounts.length > 0 && (
                                  <p className="text-[12px] text-ds-text-3 font-mono">
                                    {row.category.accounts
                                      .map((a) => `${a.code} · ${a.name}`)
                                      .join(" · ")}
                                  </p>
                                )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Surface>

      <FlowHealthPanel onResolveAccount={onResolveAccount} />
    </div>
  );
}
