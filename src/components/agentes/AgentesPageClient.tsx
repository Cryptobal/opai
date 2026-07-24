"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Bot, AlertTriangle } from "lucide-react";
import { Surface, Skeleton, Tag } from "@/components/opai-ds";
import { cn } from "@/lib/utils";

type Vertical = "comercial" | "operaciones" | "rrhh" | "finanzas";
interface AgentesData {
  canManage: boolean;
  verticals: Record<Vertical, boolean>;
  budget: { budget: number; used: number; exceeded: boolean };
  usage: Array<{ feature: string; totalTokens: number; estimatedCost: number; calls: number }>;
  model: { providerType: string; modelId: string } | null;
}

const VERTICAL_LABELS: Record<Vertical, string> = {
  comercial: "⭐ Comercial (leads, señales de compra)",
  operaciones: "⚠️ Operaciones (reclamos, solicitudes)",
  rrhh: "👤 RRHH (postulaciones, solicitudes)",
  finanzas: "💰 Finanzas / Cobranza",
};
const fmt = (n: number) => n.toLocaleString("es-CL");

export function AgentesPageClient() {
  const [data, setData] = useState<AgentesData | null>(null);
  const [budgetInput, setBudgetInput] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/crm/agentes").catch(() => null);
    const json = res?.ok ? ((await res.json()) as AgentesData) : null;
    setData(json);
    if (json) setBudgetInput(String(json.budget.budget || ""));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/crm/agentes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => null);
      if (!res?.ok) {
        toast.error("No se pudo guardar");
        return;
      }
      toast.success("Guardado");
      void load();
    },
    [load],
  );

  if (!data) {
    return <Skeleton className="h-40 w-full rounded-2xl" />;
  }

  const { budget } = data;
  const pct = budget.budget > 0 ? Math.min(100, Math.round((budget.used / budget.budget) * 100)) : 0;

  return (
    <div className="space-y-4 min-w-0">
      <div>
        <h2 className="text-[15px] font-semibold text-ds-text-1">Agentes IA (Radar)</h2>
        <p className="text-[13px] text-ds-text-3">
          Activa las verticales del Radar, controla el presupuesto mensual de IA y revisa el consumo por feature.
        </p>
      </div>

      {budget.exceeded && (
        <Surface className="flex items-center gap-2 border-status-danger-fg/30 p-3 text-[13px] text-status-danger-fg">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Presupuesto mensual de IA agotado. Los extractores bajo demanda están pausados; la clasificación de la bandeja sigue activa.
        </Surface>
      )}

      <Surface className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-ds-text-4" />
          <h3 className="text-[14px] font-semibold text-ds-text-1">Verticales activas</h3>
        </div>
        <div className="space-y-2">
          {(Object.keys(VERTICAL_LABELS) as Vertical[]).map((v) => (
            <label key={v} className="flex items-center justify-between gap-3 rounded-xl border border-ds-border-subtle px-3 py-2">
              <span className="text-[13px] text-ds-text-1">{VERTICAL_LABELS[v]}</span>
              <input
                type="checkbox"
                checked={data.verticals[v]}
                disabled={!data.canManage}
                onChange={(e) => save({ vertical: v, enabled: e.target.checked })}
                aria-label={`Activar ${v}`}
                className="h-5 w-9 shrink-0 accent-primary"
              />
            </label>
          ))}
        </div>
      </Surface>

      <Surface className="space-y-3 p-4">
        <h3 className="text-[14px] font-semibold text-ds-text-1">Presupuesto mensual de IA</h3>
        <p className="text-[12px] text-ds-text-4">
          Límite de tokens por mes. Al superarse, los extractores bajo demanda se bloquean (la clasificación base no se ve afectada). 0 = sin límite.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={0}
            value={budgetInput}
            onChange={(e) => setBudgetInput(e.target.value)}
            disabled={!data.canManage}
            aria-label="Presupuesto mensual de tokens"
            className="h-10 w-40 rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] text-ds-text-1"
          />
          {data.canManage && (
            <button
              type="button"
              onClick={() => save({ budget: Number(budgetInput) || 0 })}
              className="h-10 rounded-xl bg-primary px-4 text-[13px] font-medium text-primary-foreground"
            >
              Guardar
            </button>
          )}
          <span className="text-[13px] text-ds-text-4">
            Usados este mes: <strong className="text-ds-text-1">{fmt(budget.used)}</strong>
            {budget.budget > 0 && ` / ${fmt(budget.budget)} (${pct}%)`}
          </span>
        </div>
        {budget.budget > 0 && (
          <div className="h-2 w-full overflow-hidden rounded-full bg-ds-surface-3">
            <div
              className={cn("h-full rounded-full", budget.exceeded ? "bg-status-danger-fg" : "bg-primary")}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </Surface>

      <Surface className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[14px] font-semibold text-ds-text-1">Consumo de IA este mes</h3>
          {data.model && (
            <Tag>
              Modelo efectivo: {data.model.providerType} · {data.model.modelId}
            </Tag>
          )}
        </div>
        {data.usage.length === 0 ? (
          <p className="text-[13px] text-ds-text-4">Sin consumo registrado este mes.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[12px] text-ds-text-4">
                  <th className="py-1 pr-3 font-medium">Feature</th>
                  <th className="py-1 pr-3 text-right font-medium">Llamadas</th>
                  <th className="py-1 pr-3 text-right font-medium">Tokens</th>
                  <th className="py-1 text-right font-medium">Costo (USD)</th>
                </tr>
              </thead>
              <tbody>
                {data.usage.map((u) => (
                  <tr key={u.feature} className="border-t border-ds-border-subtle">
                    <td className="py-1.5 pr-3 text-ds-text-1">{u.feature}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-ds-text-2">{fmt(u.calls)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-ds-text-2">{fmt(u.totalTokens)}</td>
                    <td className="py-1.5 text-right tabular-nums text-ds-text-2">${u.estimatedCost.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Surface>
    </div>
  );
}
