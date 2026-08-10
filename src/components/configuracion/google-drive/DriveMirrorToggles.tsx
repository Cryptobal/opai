"use client";

import { Switch } from "@/components/ui/switch";
import { SectionHeader } from "@/components/opai-ds";
import {
  MIRROR_DOC_TYPE_GROUPS,
  type SupportedDocType,
} from "@/lib/google-workspace/drive-mirror-config";

const LABELS: Record<string, string> = {
  cotizacion: "Cotizaciones",
  factura: "Facturas / documentos de cobro",
  licitacion: "Licitaciones",
  negocios: "Documentos de negocios",
  personas: "Documentos de contactos CRM",
  documentos: "Documentos de cuentas / instalaciones",
  leads: "Leads",
  trabajadores: "Documentos de trabajadores",
  ops_documentos: "Documentos operacionales",
};

type Props = {
  config: Record<string, boolean>;
  disabled?: boolean;
  enabledModules?: string[];
  onChange: (key: string, value: boolean) => void;
};

export function DriveMirrorToggles({
  config,
  disabled,
  enabledModules = [],
  onChange,
}: Props) {
  const modSet = new Set(enabledModules);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {MIRROR_DOC_TYPE_GROUPS.map((group) => {
        const moduleOn =
          group.tenantModules.length === 0 ||
          group.tenantModules.some((m) => modSet.has(m));
        return (
          <div
            key={group.module}
            className={moduleOn ? "space-y-2" : "space-y-2 opacity-50"}
          >
            <SectionHeader
              title={group.label}
              hint={moduleOn ? undefined : "Módulo no habilitado en el tenant"}
            />
            <ul className="space-y-2">
              {group.docTypes.map((key: SupportedDocType) => (
                <li
                  key={key}
                  className="flex items-center justify-between gap-3 rounded-xl border border-ds-border-subtle bg-ds-surface-1 px-3 py-2.5"
                >
                  <span className="text-[13px] text-ds-text-2">{LABELS[key] ?? key}</span>
                  <Switch
                    size="lg"
                    checked={Boolean(config[key])}
                    disabled={disabled || !moduleOn}
                    onCheckedChange={(v) => onChange(key, v)}
                    aria-label={LABELS[key] ?? key}
                  />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
