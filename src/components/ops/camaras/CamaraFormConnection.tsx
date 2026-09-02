"use client";

import { Input } from "@/components/ui/input";
import { CamaraField } from "./form-field";
import { brandPortHint } from "./form-brands";
import type { CamaraFormState } from "./form-state";

type Props = {
  form: CamaraFormState;
  onChange: (patch: Partial<CamaraFormState>) => void;
};

export function CamaraFormConnection({ form, onChange }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <CamaraField label="Nombre">
        <Input className="h-10 sm:h-9" value={form.name} onChange={(e) => onChange({ name: e.target.value })} />
      </CamaraField>
      <CamaraField label="Host / DDNS">
        <Input className="h-10 sm:h-9" value={form.host} onChange={(e) => onChange({ host: e.target.value })} />
      </CamaraField>
      <CamaraField label={`Puerto RTSP (${brandPortHint(form.brand)})`}>
        <Input className="h-10 sm:h-9" type="number" value={form.rtspPort} onChange={(e) => onChange({ rtspPort: Number(e.target.value) })} />
      </CamaraField>
      <CamaraField label="Canal">
        <Input className="h-10 sm:h-9" type="number" value={form.channel} onChange={(e) => onChange({ channel: Number(e.target.value) })} />
      </CamaraField>
      <CamaraField label="Usuario">
        <Input className="h-10 sm:h-9" value={form.username} onChange={(e) => onChange({ username: e.target.value })} />
      </CamaraField>
      <CamaraField label={form.id ? "Clave (vacío = conservar)" : "Clave"}>
        <Input className="h-10 sm:h-9" type="password" value={form.password} onChange={(e) => onChange({ password: e.target.value })} />
      </CamaraField>
      {form.brand === "generic" && (
        <CamaraField label="Path RTSP">
          <Input className="h-10 sm:h-9" value={form.customPath} onChange={(e) => onChange({ customPath: e.target.value })} />
        </CamaraField>
      )}
      <label className="flex h-11 items-center gap-2 text-[13px] text-ds-text-2 sm:col-span-2">
        <input
          type="checkbox"
          checked={form.streamQuality === "main"}
          onChange={(e) => onChange({ streamQuality: e.target.checked ? "main" : "sub" })}
        />
        Stream principal (más bitrate)
      </label>
      <label className="flex h-11 items-center gap-2 text-[13px] text-ds-text-2 sm:col-span-2">
        <input
          type="checkbox"
          checked={form.ptzCapable}
          onChange={(e) => onChange({ ptzCapable: e.target.checked })}
        />
        Cámara con PTZ
      </label>
      {form.username.trim().toLowerCase() === "admin" && (
        <p className="sm:col-span-2 text-[13px] text-status-warn-fg">
          Usa un usuario de solo visualización; evita &quot;admin&quot;.
        </p>
      )}
    </div>
  );
}
