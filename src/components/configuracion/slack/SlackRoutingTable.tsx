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
 * Tabla de ruteo evento→canal. Precedencia: evento (KEY) > categoría (CATEGORY) >
 * módulo (MODULE) > canal por defecto. Agrupa el catálogo por `category` y cada
 * header de grupo tiene su propio picker de canal. Mobile: tarjetas.
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

  const byCategoryRoute = useMemo(() => {
    const m = new Map<string, SlackRoute>();
    for (const r of config.routes) if (r.matchType === "CATEGORY") m.set(r.matchValue, r);
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
          <h3 className="text-sm font-semibold">Reglas por categoría y evento</h3>
          <p className="text-xs text-muted-foreground">
            Rutea toda una categoría a un canal con un clic. Prioridad: evento &gt; categoría &gt; módulo &gt; canal por defecto.
          </p>
        </div>
        {byCategory.map((group) => {
          const overridden = group.types.filter((t) => byKey.has(t.key)).length;
          const catRoute = byCategoryRoute.get(group.category);
          return (
            <div key={group.category} className="space-y-2">
              <SlackRouteRow
                emphasis
                label={group.category}
                sublabel={
                  overridden > 0
                    ? `${overridden} evento(s) con regla propia (prevalece sobre esta)`
                    : "Aplica a toda la categoría"
                }
                matchType="CATEGORY"
                matchValue={group.category}
                route={catRoute}
                channels={channels}
                onChanged={onChanged}
              />
              <div className="space-y-2 sm:pl-4">
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
          );
        })}
      </section>
    </div>
  );
}
