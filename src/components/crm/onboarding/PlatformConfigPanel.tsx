"use client";

import { ExternalLink, CheckCircle2, Circle } from "lucide-react";
import type { PlatformConfigStatus } from "./types";

type Item = {
  key: keyof PlatformConfigStatus;
  label: string;
  buildHref: (installationId: string) => string;
};

const ITEMS: Item[] = [
  {
    key: "instalacionCreated",
    label: "Instalación creada",
    buildHref: (id) => `/crm/installations/${id}`,
  },
  {
    key: "puestosCreated",
    label: "Puestos físicos creados",
    buildHref: (id) => `/ops/puestos?installationId=${id}`,
  },
  {
    key: "pautaCurrentMonth",
    label: "Pauta del mes vigente",
    buildHref: (id) => `/ops/pauta-mensual?installationId=${id}`,
  },
  {
    key: "rondasConfigured",
    label: "Rondas configuradas",
    buildHref: (id) => `/ops/rondas?installationId=${id}`,
  },
  {
    key: "marcacionConfigured",
    label: "Marcación configurada",
    buildHref: (id) => `/ops/marcaciones?installationId=${id}`,
  },
  {
    key: "testConocimientoConfigured",
    label: "Test de conocimiento configurado",
    buildHref: (id) => `/personas/conocimiento/${id}`,
  },
];

export function PlatformConfigPanel({
  status,
  installationId,
}: {
  status: PlatformConfigStatus;
  installationId: string | null;
}) {
  return (
    <div className="space-y-2 rounded-md border p-3">
      <h4 className="text-sm font-medium">Configuración de plataforma</h4>
      <p className="text-xs text-muted-foreground">
        Estos no son tickets — son flujos existentes a configurar en paralelo.
      </p>
      <ul className="space-y-1.5">
        {ITEMS.map((item) => {
          const ok = status[item.key];
          const href = installationId ? item.buildHref(installationId) : "#";
          return (
            <li
              key={item.key}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="flex items-center gap-2">
                {ok ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground" />
                )}
                <span>{item.label}</span>
              </span>
              {installationId ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Configurar <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Crear sitio primero
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
