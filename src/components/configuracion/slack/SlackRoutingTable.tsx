"use client";

import { useMemo } from "react";
import { SlackRouteRow } from "./SlackRouteRow";
import type { SlackChannelOption, SlackConfig, SlackRoute } from "./types";

const MODULE_LABELS: Record<string, string> = {
  crm: "CRM",
  cpq: "Cotizaciones (CPQ)",
  docs: "Documentos",
  finance: "Finanzas",
  ops: "Operaciones",
  payroll: "Payroll",
  chat: "Chat",
  config: "Configuración",
};

/**
 * Tabla de ruteo evento→canal. Precedencia: evento (KEY) > módulo (MODULE) >
 * canal por defecto. Agrupa el catálogo por `category`. Mobile: tarjetas.
 */
export function SlackRoutingTable({
  config,
  channels,
  onChanged,
}: {
  config: SlackConfig;
  channels: SlackChannelOption[];
  onChanged: () => void;
}) {
  const byKey = useMemo(() => {
    const m = new Map<string, SlackRoute>();
    for (const r of config.routes) if (r.matchType === "KEY") m.set(r.matchValue, r);
    return m;
  }, [config.routes]);

  const byModule = useMemo(() => {
    const m = new Map<string, SlackRoute>();
    for (const r of config.routes) if (r.matchType === "MODULE") m.set(r.matchValue, r);
    return m;
  }, [config.routes]);

  const modules = useMemo(() => {
    const seen: string[] = [];
    for (const t of config.notifTypes) if (!seen.includes(t.module)) seen.push(t.module);
    return seen;
  }, [config.notifTypes]);

  const byCategory = useMemo(() => {
    const groups: { category: string; types: typeof config.notifTypes }[] = [];
    for (const t of config.notifTypes) {
      let g = groups.find((x) => x.category === t.category);
      if (!g) {
        g = { category: t.category, types: [] };
        groups.push(g);
      }
      g.types.push(t);
    }
    return groups;
  }, [config.notifTypes]);

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <div>
          <h3 className="text-sm font-semibold">Reglas por módulo</h3>
          <p className="text-xs text-muted-foreground">
            Aplica a todos los eventos del módulo salvo que el evento tenga su propia regla.
          </p>
        </div>
        <div className="space-y-2">
          {modules.map((mod) => (
            <SlackRouteRow
              key={mod}
              label={MODULE_LABELS[mod] ?? mod}
              matchType="MODULE"
              matchValue={mod}
              route={byModule.get(mod)}
              channels={channels}
              onChanged={onChanged}
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Reglas por evento</h3>
          <p className="text-xs text-muted-foreground">
            Ruteo específico por tipo de notificación. Tiene prioridad sobre la regla de módulo.
          </p>
        </div>
        {byCategory.map((group) => (
          <div key={group.category} className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {group.category}
            </p>
            <div className="space-y-2">
              {group.types.map((t) => (
                <SlackRouteRow
                  key={t.key}
                  label={t.label}
                  sublabel={t.key}
                  matchType="KEY"
                  matchValue={t.key}
                  route={byKey.get(t.key)}
                  channels={channels}
                  onChanged={onChanged}
                />
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
