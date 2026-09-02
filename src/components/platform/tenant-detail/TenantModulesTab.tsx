"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { SegmentedControl, Tag, showUndo } from "@/components/opai-ds";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { platformJson } from "../platform-fetch";
import { RoleGuard } from "../RoleGuard";
import { MODULE_CATEGORY_LABELS } from "@/lib/modules/registry";
import type { TenantModuleRow } from "@/lib/platform/module-origin";
import { originLabel } from "@/lib/platform/module-origin";
import { usePlatformUi } from "../PlatformUiProvider";

type Filter = "all" | "enabled" | "disabled";

export function TenantModulesTab({ tenantId }: { tenantId: string }) {
  const { can } = usePlatformUi();
  const [rows, setRows] = useState<TenantModuleRow[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const json = await platformJson<{ modules: TenantModuleRow[] }>(
      `/api/platform/tenants/${tenantId}/modules`,
    );
    setRows(json.modules);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const enabled = rows.filter((r) => r.enabled).length;
    return { all: rows.length, enabled, disabled: rows.length - enabled };
  }, [rows]);

  const visible = rows.filter((r) => {
    if (filter === "enabled") return r.enabled;
    if (filter === "disabled") return !r.enabled;
    return true;
  });

  const toggle = async (row: TenantModuleRow, enabled: boolean) => {
    if (!can("admin")) return;
    const prev = row.enabled;
    setRows((list) => list.map((r) => (r.key === row.key ? { ...r, enabled } : r)));
    try {
      await platformJson(`/api/platform/tenants/${tenantId}/modules`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module: row.key, enabled }),
      });
      showUndo({
        message: `${row.label} ${enabled ? "habilitado" : "deshabilitado"}`,
        durationMs: 4000,
        onUndo: async () => {
          await platformJson(`/api/platform/tenants/${tenantId}/modules`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ module: row.key, enabled: prev }),
          });
          setRows((list) => list.map((r) => (r.key === row.key ? { ...r, enabled: prev } : r)));
        },
      });
    } catch (e) {
      setRows((list) => list.map((r) => (r.key === row.key ? { ...r, enabled: prev } : r)));
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar");
    }
  };

  return (
    <div className="space-y-4">
      <SegmentedControl
        ariaLabel="Módulos"
        value={filter}
        onChange={setFilter}
        items={[
          { id: "all", label: "Todos", count: counts.all },
          { id: "enabled", label: "Habilitados", count: counts.enabled },
          { id: "disabled", label: "Deshabilitados", count: counts.disabled },
        ]}
      />
      {loading ? <p className="text-[13px] text-ds-text-3">Cargando…</p> : null}
      <ul className="grid gap-2 md:grid-cols-2">
        {visible.map((row) => (
          <li
            key={row.key}
            className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-ds-border-subtle bg-ds-surface-1 px-3 py-2"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[13px] text-ds-text-1">{row.label}</span>
                <Tag size="sm" variant="neutral">
                  {MODULE_CATEGORY_LABELS[row.category as keyof typeof MODULE_CATEGORY_LABELS] ??
                    row.category}
                </Tag>
                <Tag size="sm" variant={row.origin === "manual" ? "warn" : "info"}>
                  {originLabel(row.origin)}
                </Tag>
                {row.beta ? (
                  <Tag size="sm" variant="warn">
                    Beta
                  </Tag>
                ) : null}
                {row.manualOverride ? (
                  <span title="Se perderá al cambiar de plan">
                    <AlertTriangle className="h-3.5 w-3.5 text-status-warn-fg" />
                  </span>
                ) : null}
              </div>
            </div>
            <RoleGuard minRole="admin">
              <Switch
                checked={row.enabled}
                disabled={!can("admin")}
                onCheckedChange={(v) => void toggle(row, v)}
              />
            </RoleGuard>
          </li>
        ))}
      </ul>
    </div>
  );
}
