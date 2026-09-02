"use client";

import { BRAND_PROFILES } from "@/lib/camaras/brand-profiles";
import { CAMERA_BRANDS, SOURCE_TYPES } from "@/lib/camaras/types";
import { Surface } from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import { CamaraFormConnection } from "./CamaraFormConnection";
import type { CamaraFormState } from "./form-state";
import { BRAND_LABELS } from "./status";

type Props = {
  step: number;
  form: CamaraFormState;
  onChange: (patch: Partial<CamaraFormState>) => void;
  snapshot?: string | null;
  testing?: boolean;
  onTest?: () => void;
  testError?: string | null;
};

export function CamaraFormSteps({ step, form, onChange, snapshot, testing, onTest, testError }: Props) {
  if (step === 0) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {SOURCE_TYPES.map((type) => (
          <Surface
            key={type}
            tappable
            selected={form.sourceType === type}
            className="cursor-pointer"
            onClick={() => onChange({ sourceType: type })}
          >
            <p className="font-medium text-ds-text-1">{type === "nvr" ? "NVR / DVR" : "Cámara directa"}</p>
            <p className="mt-1 text-[13px] text-ds-text-3">
              {type === "nvr"
                ? "Varios canales en un grabador. Indica el canal."
                : "IP única de la cámara."}
            </p>
          </Surface>
        ))}
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {CAMERA_BRANDS.map((brand) => (
          <button
            key={brand}
            type="button"
            onClick={() => onChange({
              brand,
              rtspPort: BRAND_PROFILES[brand].rtspPort,
              onvifPort: BRAND_PROFILES[brand].onvifPort,
            })}
            className={cn(
              "h-11 rounded-ds-md border px-3 text-[13px]",
              form.brand === brand
                ? "border-primary bg-primary/10 text-primary"
                : "border-ds-border-default bg-ds-surface-2 text-ds-text-1",
            )}
          >
            {BRAND_LABELS[brand]}
          </button>
        ))}
      </div>
    );
  }

  if (step === 2) {
    return <CamaraFormConnection form={form} onChange={onChange} />;
  }

  if (step === 3) {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={onTest}
          disabled={testing}
          className="h-11 rounded-ds-md bg-primary px-4 text-[13px] text-primary-foreground disabled:opacity-50"
        >
          {testing ? "Probando…" : "Probar conexión"}
        </button>
        {testError && <p className="text-[13px] text-status-danger-fg">{testError}</p>}
        {snapshot && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={snapshot} alt="Snapshot" className="w-full rounded-ds-md border border-ds-border-default" />
        )}
      </div>
    );
  }

  return (
    <ul className="space-y-1 text-[13px] text-ds-text-2">
      <li>{form.name} · {BRAND_LABELS[form.brand]}</li>
      <li>{form.host}:{form.rtspPort} · canal {form.channel}</li>
      <li>Calidad {form.streamQuality === "main" ? "principal" : "sub"}</li>
    </ul>
  );
}
