"use client";

import { ExternalLink, CheckCircle2, Circle } from "lucide-react";
import type { PlatformConfigStatus } from "./types";
import { cn } from "@/lib/utils";

type Item = {
  key: keyof PlatformConfigStatus;
  label: string;
  buildHref: (installationId: string) => string;
};

const ITEMS: Item[] = [
  { key: "instalacionCreated",         label: "Instalación creada",                 buildHref: (id) => `/crm/installations/${id}` },
  { key: "puestosCreated",             label: "Puestos físicos creados",            buildHref: (id) => `/ops/puestos?installationId=${id}` },
  { key: "pautaCurrentMonth",          label: "Pauta del mes vigente",              buildHref: (id) => `/ops/pauta-mensual?installationId=${id}` },
  { key: "rondasConfigured",           label: "Rondas configuradas",                buildHref: (id) => `/ops/rondas?installationId=${id}` },
  { key: "marcacionConfigured",        label: "Marcación configurada",              buildHref: (id) => `/ops/marcaciones?installationId=${id}` },
  { key: "testConocimientoConfigured", label: "Test de conocimiento configurado",   buildHref: (id) => `/personas/conocimiento/${id}` },
];

export function PlatformConfigPanel({
  status,
  installationId,
}: {
  status: PlatformConfigStatus;
  installationId: string | null;
}) {
  const okCount = ITEMS.filter((i) => status[i.key]).length;

  return (
    <section
      className="rounded-xl border border-ds-border-default bg-ds-surface-1 p-4"
      aria-label="Configuración de plataforma"
    >
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-ds-text-3">
          Configuración de plataforma
        </h3>
        <span className="text-[11px] tabular-nums text-ds-text-3">
          {okCount}/{ITEMS.length}
        </span>
      </div>
      <p className="mb-3 text-[12px] text-ds-text-3">
        Flujos en paralelo (no son tickets).
      </p>
      <ul className="space-y-1">
        {ITEMS.map((item) => {
          const ok = status[item.key];
          const href = installationId ? item.buildHref(installationId) : "#";
          return (
            <li
              key={item.key}
              className="flex items-center justify-between gap-2 rounded-md py-1 text-sm"
            >
              <span className="flex items-center gap-2.5">
                {ok ? (
                  <CheckCircle2 className="h-4 w-4 text-status-ok-fg" />
                ) : (
                  <Circle className="h-4 w-4 text-ds-text-4" />
                )}
                <span
                  className={cn(
                    ok ? "text-ds-text-1" : "text-ds-text-2",
                  )}
                >
                  {item.label}
                </span>
              </span>
              {installationId ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
                >
                  Configurar
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span className="text-[11px] text-ds-text-4">
                  Crear sitio primero
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
