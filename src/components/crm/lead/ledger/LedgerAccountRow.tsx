"use client";

import { AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { LedgerRow } from "./LedgerRow";

type DuplicateAccount = { id: string; name: string; rut?: string | null; type?: string };

/** Subconjunto de ApproveFormState que consume la fila Cuenta. */
export interface LedgerAccountFields {
  accountName: string;
  rut: string;
  legalName: string;
  legalRepresentativeName: string;
  legalRepresentativeRut: string;
  industry: string;
  segment: string;
  website: string;
  companyInfo: string;
}

export interface LedgerAccountRowProps {
  approveForm: LedgerAccountFields;
  updateApproveForm: (field: string, value: string) => void;
  inputClassName: string;
  industries: { id: string; name: string }[];
  duplicates: DuplicateAccount[];
  useExistingAccountId: string | null;
  onSelectNewAccount: () => void;
  onSelectExistingAccount: (id: string | null) => void;
  /** Bloque de enriquecimiento web + logo detectado (deps externas del client). */
  enrichSlot?: React.ReactNode;
  defaultOpen?: boolean;
}

export function LedgerAccountRow({
  approveForm,
  updateApproveForm,
  inputClassName,
  industries,
  duplicates,
  useExistingAccountId,
  onSelectNewAccount,
  onSelectExistingAccount,
  enrichSlot,
  defaultOpen,
}: LedgerAccountRowProps) {
  const hasDup = duplicates.length > 0;
  const flag = hasDup
    ? useExistingAccountId
      ? ({ label: "resuelto", tone: "ok" } as const)
      : ({ label: "duplicado", tone: "warn" } as const)
    : undefined;

  return (
    <LedgerRow
      id="ledger-account"
      type="Cuenta"
      name={approveForm.accountName || "Sin nombre"}
      meta={approveForm.rut || approveForm.industry || undefined}
      flag={flag}
      created
      defaultOpen={defaultOpen ?? true}
    >
      <div className="space-y-4">
        {hasDup && (
          <div className="space-y-2 rounded-lg border border-status-warn-border bg-status-warn-soft p-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-status-warn-fg">
              <AlertTriangle className="h-4 w-4" />
              Cuenta con el mismo nombre ya existe
            </div>
            <div className="flex flex-col gap-2 pl-6">
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs">
                <input type="radio" name="accountResolution" checked={!useExistingAccountId} onChange={onSelectNewAccount} className="rounded border-input" />
                Crear nueva cuenta
              </label>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs">
                <input type="radio" name="accountResolution" checked={!!useExistingAccountId} onChange={() => onSelectExistingAccount(duplicates[0]?.id ?? null)} className="rounded border-input" />
                Usar cuenta existente:
              </label>
              <select
                className="ml-6 mt-1 min-h-11 w-full max-w-[280px] rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:max-w-xs"
                value={useExistingAccountId ?? ""}
                onChange={(e) => onSelectExistingAccount(e.target.value || null)}
              >
                <option value="">Seleccionar cuenta...</option>
                {duplicates.map((dup) => (
                  <option key={dup.id} value={dup.id}>
                    {dup.name} {dup.rut ? `(${dup.rut})` : ""} — {dup.type === "client" ? "Cliente" : "Prospecto"}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5 md:col-span-2 lg:col-span-3">
            <Label>Nombre de empresa *</Label>
            <Input value={approveForm.accountName} onChange={(e) => updateApproveForm("accountName", e.target.value)} placeholder="Nombre de la empresa" className={inputClassName} />
          </div>
          <div className="space-y-1.5">
            <Label>RUT</Label>
            <Input value={approveForm.rut} onChange={(e) => updateApproveForm("rut", e.target.value)} placeholder="76.123.456-7" className={inputClassName} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Razón social (empresa)</Label>
            <Input value={approveForm.legalName} onChange={(e) => updateApproveForm("legalName", e.target.value)} placeholder="Empresa SpA / Ltda / S.A." className={inputClassName} />
          </div>
          <div className="space-y-1.5">
            <Label>Representante legal</Label>
            <Input value={approveForm.legalRepresentativeName} onChange={(e) => updateApproveForm("legalRepresentativeName", e.target.value)} placeholder="Nombre completo" className={inputClassName} />
          </div>
          <div className="space-y-1.5">
            <Label>RUT representante legal</Label>
            <Input value={approveForm.legalRepresentativeRut} onChange={(e) => updateApproveForm("legalRepresentativeRut", e.target.value)} placeholder="12.345.678-9" className={inputClassName} />
          </div>
          <div className="space-y-1.5">
            <Label>Industria</Label>
            <SearchableSelect value={approveForm.industry} options={industries.map((i) => ({ id: i.name, label: i.name }))} placeholder="Seleccionar industria" onChange={(val) => updateApproveForm("industry", val)} />
          </div>
          <div className="space-y-1.5">
            <Label>Segmento</Label>
            <Input value={approveForm.segment} onChange={(e) => updateApproveForm("segment", e.target.value)} placeholder="Corporativo, PYME..." className={inputClassName} />
          </div>
          <div className="space-y-1.5 md:col-span-2 lg:col-span-3">{enrichSlot}</div>
        </div>
      </div>
    </LedgerRow>
  );
}
