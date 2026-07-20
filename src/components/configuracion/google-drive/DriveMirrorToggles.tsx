"use client";

import { Switch } from "@/components/ui/switch";
import { SUPPORTED_DOC_TYPES } from "@/lib/google-workspace/drive-mirror-config";

const LABELS: Record<string, string> = {
  cotizacion: "Cotizaciones",
  factura: "Facturas / documentos de cobro",
  licitacion: "Licitaciones (copia extra)",
};

type Props = {
  config: Record<string, boolean>;
  disabled?: boolean;
  onChange: (key: string, value: boolean) => void;
};

export function DriveMirrorToggles({ config, disabled, onChange }: Props) {
  return (
    <ul className="space-y-2">
      {SUPPORTED_DOC_TYPES.map((key) => (
        <li
          key={key}
          className="flex items-center justify-between gap-3 rounded-xl border border-ds-border-subtle bg-ds-surface-1 px-3 py-2.5"
        >
          <span className="text-[13px] text-ds-text-2">{LABELS[key] ?? key}</span>
          <Switch
            size="lg"
            checked={Boolean(config[key])}
            disabled={disabled}
            onCheckedChange={(v) => onChange(key, v)}
            aria-label={LABELS[key] ?? key}
          />
        </li>
      ))}
    </ul>
  );
}
