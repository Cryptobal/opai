"use client";

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
          <button
            type="button"
            role="switch"
            aria-checked={Boolean(config[key])}
            disabled={disabled}
            onClick={() => onChange(key, !config[key])}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ds-tap ${
              config[key] ? "bg-primary" : "bg-ds-surface-3"
            } disabled:opacity-50`}
          >
            <span
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-background shadow transition-transform ${
                config[key] ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </li>
      ))}
    </ul>
  );
}
