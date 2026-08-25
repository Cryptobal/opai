"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/opai-ds";
import {
  TEMPLATE_SIGNER_ROLE_LABELS,
  TEMPLATE_SIGNER_ROLES,
  type TemplateSignerRole,
} from "@/lib/docs/laborales/constants";

export type TemplateSignerDraft = {
  role: TemplateSignerRole;
  signerRefId?: string | null;
  name?: string | null;
  email?: string | null;
  signingOrder: number;
  autoStamp?: boolean;
};

type TenantSignerOpt = { id: string; role: string; name: string; email: string };

function patch(signers: TemplateSignerDraft[], idx: number, patch: Partial<TemplateSignerDraft>) {
  const next = [...signers];
  next[idx] = { ...next[idx], ...patch };
  return next;
}

export function TemplateSignersEditor({
  signers,
  onChange,
}: {
  signers: TemplateSignerDraft[];
  onChange: (s: TemplateSignerDraft[]) => void;
}) {
  const [tenantSigners, setTenantSigners] = useState<TenantSignerOpt[]>([]);
  useEffect(() => {
    void fetch("/api/docs/tenant-signers")
      .then((r) => r.json())
      .then((d) => { if (d.success) setTenantSigners(d.data); });
  }, []);

  function move(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (idx === 0 || j < 1 || j >= signers.length) return;
    const next = [...signers];
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next.map((s, i) => ({ ...s, signingOrder: i + 1 })));
  }

  return (
    <Surface elevation={1} padding="md" className="space-y-3">
      <p className="font-medium">Firmantes</p>
      {signers.map((s, idx) => {
        const company = tenantSigners.filter((t) => t.role === s.role);
        return (
          <div key={idx} className="grid gap-2 sm:grid-cols-5 items-center">
            <select
              disabled={idx === 0}
              className="h-10 sm:h-9 rounded-md border border-ds-border-default bg-ds-surface-1 px-2 text-[13px]"
              value={s.role}
              onChange={(e) => onChange(patch(signers, idx, { role: e.target.value as TemplateSignerRole, signerRefId: null }))}
            >
              {TEMPLATE_SIGNER_ROLES.map((role) => (
                <option key={role} value={role}>{TEMPLATE_SIGNER_ROLE_LABELS[role]}</option>
              ))}
            </select>
            {company.length > 0 ? (
              <select
                className="h-10 sm:h-9 rounded-md border border-ds-border-default bg-ds-surface-1 px-2 text-[13px] sm:col-span-2"
                value={s.signerRefId ?? ""}
                onChange={(e) => {
                  const found = company.find((t) => t.id === e.target.value);
                  onChange(patch(signers, idx, { signerRefId: e.target.value || null, name: found?.name, email: found?.email }));
                }}
              >
                <option value="">Seleccionar persona</option>
                {company.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            ) : (
              <input
                className="h-10 sm:h-9 rounded-md border border-ds-border-default bg-ds-surface-1 px-2 text-[13px] sm:col-span-2"
                placeholder={s.role === "trabajador" || s.role === "supervisor_instalacion" ? "Dinámico" : "Nombre / email"}
                value={s.email || s.name || ""}
                disabled={s.role === "trabajador" || s.role === "supervisor_instalacion"}
                onChange={(e) => onChange(patch(signers, idx, { email: e.target.value, name: e.target.value }))}
              />
            )}
            <label className="flex min-h-11 items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                disabled={s.role === "trabajador"}
                checked={Boolean(s.autoStamp)}
                onChange={(e) => onChange(patch(signers, idx, { autoStamp: e.target.checked }))}
              />
              Auto
            </label>
            {idx > 0 && (
              <div className="flex gap-1">
                <Button type="button" variant="ghost" className="min-h-11 min-w-11 sm:min-h-9" onClick={() => move(idx, -1)}>↑</Button>
                <Button type="button" variant="ghost" className="min-h-11 min-w-11 sm:min-h-9" onClick={() => move(idx, 1)}>↓</Button>
                <Button type="button" variant="ghost" className="min-h-11 min-w-11 sm:min-h-9" onClick={() => onChange(signers.filter((_, i) => i !== idx))}>✕</Button>
              </div>
            )}
          </div>
        );
      })}
      <Button
        variant="outline"
        className="min-h-11 sm:min-h-9"
        onClick={() => onChange([...signers, { role: "rep_legal", signingOrder: signers.length + 1, autoStamp: false }])}
      >
        Agregar firmante
      </Button>
    </Surface>
  );
}
