"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Lock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { TransactionalEmailKind } from "@/lib/email/transactional-catalog";

type Row = TransactionalEmailKind & { enabled: boolean; updatedAt: string | null };

const MODULE_LABELS: Record<string, string> = {
  commercial: "Comercial",
  operations: "Operaciones",
  finance: "Finanzas",
  system: "Sistema",
};

export function TransactionalEmailMatrixClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/configuracion/email-transactional");
      const json = await res.json();
      if (json.success) setRows(json.data as Row[]);
      else toast.error(json.error ?? "No se pudo cargar la configuración");
    } catch {
      toast.error("Error al cargar configuración");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = useCallback(
    async (kind: string, enabled: boolean) => {
      setPending((p) => new Set(p).add(kind));
      // Optimistic update
      setRows((prev) => prev.map((r) => (r.key === kind ? { ...r, enabled } : r)));
      try {
        const res = await fetch("/api/configuracion/email-transactional", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, enabled }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          // Revert
          setRows((prev) => prev.map((r) => (r.key === kind ? { ...r, enabled: !enabled } : r)));
          toast.error(json.error ?? "No se pudo actualizar");
          return;
        }
        toast.success(enabled ? "Correo activado" : "Correo desactivado");
      } catch {
        setRows((prev) => prev.map((r) => (r.key === kind ? { ...r, enabled: !enabled } : r)));
        toast.error("Error al actualizar");
      } finally {
        setPending((p) => {
          const next = new Set(p);
          next.delete(kind);
          return next;
        });
      }
    },
    [],
  );

  const grouped = useMemo(() => {
    const groups: Record<string, Row[]> = {};
    for (const r of rows) {
      if (!groups[r.category]) groups[r.category] = [];
      groups[r.category]!.push(r);
    }
    return groups;
  }, [rows]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category} className="rounded-lg border border-border">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold">{category}</h3>
            <p className="text-[12px] text-muted-foreground">
              Módulo: {MODULE_LABELS[items[0]!.module] ?? items[0]!.module}
            </p>
          </div>
          <div className="divide-y divide-border">
            {items.map((row) => {
              const isPending = pending.has(row.key);
              return (
                <div key={row.key} className="flex items-start justify-between gap-4 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{row.label}</p>
                      {row.required && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[12px] font-medium text-amber-700 dark:text-amber-300">
                          <Lock className="h-3 w-3" />
                          Crítico
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-muted-foreground mt-0.5">{row.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    <Switch
                      checked={row.enabled}
                      disabled={row.required || isPending}
                      onCheckedChange={(v) => toggle(row.key, v)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
