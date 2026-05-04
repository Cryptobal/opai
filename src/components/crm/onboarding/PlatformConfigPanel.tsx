"use client";

import { ExternalLink, CheckCircle2, Circle } from "lucide-react";
import type { PlatformConfigStatus } from "./types";
import { Surface } from "@/components/opai-ds/Surface";
import { SectionHeader } from "@/components/opai-ds/SectionHeader";
import { cn } from "@/lib/utils";

type Item = {
  key: keyof PlatformConfigStatus;
  label: string;
  buildHref: (installationId: string) => string;
};

const ITEMS: Item[] = [
  { key: "instalacionCreated",         label: "Instalación creada",                buildHref: (id) => `/crm/installations/${id}` },
  { key: "puestosCreated",             label: "Puestos físicos creados",           buildHref: (id) => `/ops/puestos?installationId=${id}` },
  { key: "pautaCurrentMonth",          label: "Pauta del mes vigente",             buildHref: (id) => `/ops/pauta-mensual?installationId=${id}` },
  { key: "rondasConfigured",           label: "Rondas configuradas",               buildHref: (id) => `/ops/rondas?installationId=${id}` },
  { key: "marcacionConfigured",        label: "Marcación configurada",             buildHref: (id) => `/ops/marcaciones?installationId=${id}` },
  { key: "testConocimientoConfigured", label: "Test de conocimiento configurado", buildHref: (id) => `/personas/conocimiento/${id}` },
];

export function PlatformConfigPanel({
  status,
  installationId,
}: {
  status: PlatformConfigStatus;
  installationId: string | null;
}) {
  return (
    <Surface elevation={1} padding="md" className="space-y-3">
      <SectionHeader
        size="sm"
        title="Configuración de plataforma"
        hint="No son tickets — son flujos existentes a configurar en paralelo."
      />
      <ul className="space-y-1.5">
        {ITEMS.map((item) => {
          const ok = status[item.key];
          const href = installationId ? item.buildHref(installationId) : "#";
          return (
            <li key={item.key} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2 text-ds-text-2">
                {ok ? (
                  <CheckCircle2 className="h-4 w-4 text-status-ok-fg" />
                ) : (
                  <Circle className="h-4 w-4 text-ds-text-4" />
                )}
                <span>{item.label}</span>
              </span>
              {installationId ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline",
                    "transition-colors duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
                  )}
                >
                  Configurar <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span className="text-xs text-ds-text-4">Crear sitio primero</span>
              )}
            </li>
          );
        })}
      </ul>
    </Surface>
  );
}
