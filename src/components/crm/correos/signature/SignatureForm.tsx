"use client";

import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import {
  MAX_LOGO_WIDTH,
  MIN_LOGO_WIDTH,
  normalizeChilePhone,
  normalizeWhatsAppDigits,
  type SignatureData,
  type SignatureLayout,
} from "@/modules/crm/email/signature-data";
import { ACCENT_SWATCHES, LAYOUT_OPTIONS } from "./signature-ui";

type Props = {
  data: SignatureData;
  onChange: (next: SignatureData) => void;
  disabled?: boolean;
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[12px] text-ds-text-3">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "h-11 w-full rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-ds-body text-ds-text-1 outline-none focus:border-ds-border-strong disabled:opacity-60 sm:h-10";

function UriChip({ ok, text }: { ok: boolean; text: string }) {
  return (
    <span
      className={`mt-1 inline-block break-all rounded-md px-1.5 py-0.5 font-mono text-[12px] ${
        ok
          ? "bg-ds-surface-2 text-ds-text-3"
          : "bg-status-warn-soft text-status-warn-fg"
      }`}
    >
      {text}
    </span>
  );
}

export function SignatureForm({ data, onChange, disabled }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [legalOpen, setLegalOpen] = useState(Boolean(data.disclaimer));

  function patch(partial: Partial<SignatureData>) {
    if (disabled) return;
    onChange({ ...data, ...partial });
  }

  async function onFile(file: File | null) {
    if (!file || disabled) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/crm/signatures/logo", { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(d.error || "No se pudo subir el logo");
        return;
      }
      patch({
        logoUrl: d.data?.url,
        logoStorageKey: d.data?.storageKey,
      });
      toast.success("Logo subido");
    } catch {
      toast.error("Sin conexión — no se subió el logo");
    } finally {
      setUploading(false);
    }
  }

  const phoneE164 = data.phone ? normalizeChilePhone(data.phone) : null;
  const waDigits = data.whatsapp ? normalizeWhatsAppDigits(data.whatsapp) : null;

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-ds-text-4">Identidad</p>
        <Field label="Nombre completo *">
          <input className={inputCls} disabled={disabled} value={data.fullName} maxLength={80}
            onChange={(e) => patch({ fullName: e.target.value.slice(0, 80) })} />
        </Field>
        <Field label="Cargo">
          <input className={inputCls} disabled={disabled} value={data.role ?? ""} maxLength={80}
            onChange={(e) => patch({ role: e.target.value.slice(0, 80) || undefined })} />
        </Field>
      </section>

      <section className="space-y-2">
        <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-ds-text-4">Contacto</p>
        <Field label="Teléfono">
          <input className={inputCls} disabled={disabled} value={data.phone ?? ""}
            placeholder="+56 9 8765 4321"
            onChange={(e) => patch({ phone: e.target.value || undefined })} />
          {data.phone && (
            <UriChip ok={Boolean(phoneE164)} text={phoneE164 ? `tel:${phoneE164}` : "Se enviará como texto sin enlace"} />
          )}
        </Field>
        <Field label="WhatsApp">
          <input className={inputCls} disabled={disabled} value={data.whatsapp ?? ""}
            placeholder="+56 9 8765 4321"
            onChange={(e) => patch({ whatsapp: e.target.value || undefined })} />
          {data.whatsapp && (
            <UriChip ok={Boolean(waDigits)} text={waDigits ? `wa.me/${waDigits}` : "Se enviará como texto sin enlace"} />
          )}
        </Field>
        <Field label="Email">
          <input className={inputCls} disabled={disabled} type="email" value={data.email ?? ""}
            onChange={(e) => patch({ email: e.target.value || undefined })} />
        </Field>
        <Field label="Sitio web">
          <input className={inputCls} disabled={disabled} value={data.website ?? ""}
            placeholder="gard.cl"
            onChange={(e) => patch({ website: e.target.value || undefined })} />
        </Field>
      </section>

      <section className="space-y-2">
        <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-ds-text-4">Empresa</p>
        <Field label="Nombre de la empresa">
          <input className={inputCls} disabled={disabled} value={data.company ?? ""}
            onChange={(e) => patch({ company: e.target.value || undefined })} />
        </Field>
        <Field label="Dirección">
          <input className={inputCls} disabled={disabled} value={data.address ?? ""}
            onChange={(e) => patch({ address: e.target.value || undefined })} />
        </Field>

        <div className="space-y-2">
          <span className="text-[12px] text-ds-text-3">Logo (PNG, JPEG o WebP · máx. 1 MB)</span>
          {data.logoUrl ? (
            <div className="flex items-center gap-3 rounded-xl border border-ds-border-subtle bg-white p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={data.logoUrl} alt="Logo" className="h-12 w-12 object-contain" />
              <div className="min-w-0 flex-1 text-[12px] text-ds-text-3 truncate">{data.logoStorageKey ?? "logo"}</div>
              <button type="button" disabled={disabled}
                onClick={() => patch({ logoUrl: undefined, logoStorageKey: undefined })}
                className="inline-flex h-11 items-center gap-1 rounded-lg px-2 text-[12px] text-status-danger-fg ds-tap sm:h-9">
                <X className="h-3.5 w-3.5" /> Quitar logo
              </button>
            </div>
          ) : (
            <button type="button" disabled={disabled || uploading}
              onClick={() => fileRef.current?.click()}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-ds-border-default bg-ds-surface-2 px-3 py-3 text-ds-body text-ds-text-2 ds-tap disabled:opacity-50">
              <ImagePlus className="h-4 w-4" />
              {uploading ? "Subiendo…" : "Subir logo"}
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0] ?? null)} />
          <Field label={`Ancho del logo (${data.logoWidthPx ?? 120} px)`}>
            <input type="range" min={MIN_LOGO_WIDTH} max={MAX_LOGO_WIDTH} disabled={disabled}
              value={data.logoWidthPx ?? 120}
              onChange={(e) => patch({ logoWidthPx: Number(e.target.value) })}
              className="h-11 w-full accent-primary sm:h-10" />
          </Field>
        </div>
      </section>

      <section className="space-y-2">
        <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-ds-text-4">Diseño</p>
        <div className="grid grid-cols-3 gap-2">
          {LAYOUT_OPTIONS.map((opt) => {
            const on = data.layout === opt.id;
            return (
              <button key={opt.id} type="button" disabled={disabled}
                onClick={() => patch({ layout: opt.id as SignatureLayout })}
                className={`min-h-11 rounded-xl border px-2 py-2 text-left ds-tap ${
                  on ? "border-primary/50 bg-primary/5" : "border-ds-border-subtle bg-ds-surface-1"
                }`}>
                <span className="block text-[12px] font-medium text-ds-text-1">{opt.label}</span>
                <span className="block font-mono text-[12px] text-ds-text-4">{opt.hint}</span>
              </button>
            );
          })}
        </div>
        <div>
          <span className="text-[12px] text-ds-text-3">Color de enlaces</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {ACCENT_SWATCHES.map((c) => (
              <button key={c} type="button" disabled={disabled} aria-label={`Color ${c}`}
                onClick={() => patch({ accentColor: c })}
                className={`h-11 w-11 rounded-full border-2 ds-tap sm:h-9 sm:w-9 ${
                  data.accentColor === c ? "border-ds-text-1" : "border-transparent"
                }`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
        </div>
      </section>

      <section>
        <button type="button" onClick={() => setLegalOpen((v) => !v)}
          className="text-[12px] text-ds-text-3 underline-offset-2 hover:underline ds-tap">
          {legalOpen ? "Ocultar texto legal" : "Texto legal (opcional)"}
        </button>
        {legalOpen && (
          <div className="mt-2 space-y-1">
            <textarea disabled={disabled} rows={3} maxLength={300} value={data.disclaimer ?? ""}
              onChange={(e) => patch({ disclaimer: e.target.value.slice(0, 300) || undefined })}
              className="w-full rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 py-2 text-ds-body text-ds-text-1 outline-none focus:border-ds-border-strong disabled:opacity-60" />
            <p className="text-right font-mono text-[12px] text-ds-text-4">
              {(data.disclaimer ?? "").length} / 300
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
