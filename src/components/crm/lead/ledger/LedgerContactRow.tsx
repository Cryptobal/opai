"use client";

import { AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LedgerRow } from "./LedgerRow";

type ExistingContact = { id: string; firstName: string | null; lastName: string | null; email: string | null };
type ContactResolution = "create" | "overwrite" | "use_existing";

export interface LedgerContactFields {
  contactFirstName: string;
  contactLastName: string;
  roleTitle: string;
  email: string;
  phone: string;
}

export interface LedgerContactRowProps {
  approveForm: LedgerContactFields;
  updateApproveForm: (field: string, value: string) => void;
  inputClassName: string;
  existingContact: ExistingContact | null;
  contactResolution: ContactResolution;
  onContactResolution: (r: ContactResolution) => void;
  defaultOpen?: boolean;
}

const RESOLUTIONS: { value: ContactResolution; label: string }[] = [
  { value: "overwrite", label: "Sobrescribir con los datos de este lead" },
  { value: "use_existing", label: "Mantener el contacto existente" },
  { value: "create", label: "Crear nuevo contacto (otro email)" },
];

export function LedgerContactRow({
  approveForm,
  updateApproveForm,
  inputClassName,
  existingContact,
  contactResolution,
  onContactResolution,
  defaultOpen,
}: LedgerContactRowProps) {
  const fullName = [approveForm.contactFirstName, approveForm.contactLastName].filter(Boolean).join(" ");
  const flag = existingContact
    ? contactResolution !== "create"
      ? ({ label: "resuelto", tone: "ok" } as const)
      : ({ label: "existe", tone: "warn" } as const)
    : undefined;

  return (
    <LedgerRow
      id="ledger-contact"
      type="Contacto"
      name={fullName || "Sin nombre"}
      meta={approveForm.roleTitle || approveForm.email || undefined}
      flag={flag}
      created
      defaultOpen={defaultOpen}
    >
      <div className="space-y-4">
        {existingContact && (
          <div className="space-y-2 rounded-lg border border-status-warn-border bg-status-warn-soft p-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-status-warn-fg">
              <AlertTriangle className="h-4 w-4" />
              Ya existe un contacto con este email
            </div>
            <p className="pl-6 text-xs text-muted-foreground">
              {existingContact.firstName} {existingContact.lastName} — {existingContact.email}
            </p>
            <div className="flex flex-col gap-1.5 pl-6">
              {RESOLUTIONS.map((r) => (
                <label key={r.value} className="flex min-h-11 cursor-pointer items-center gap-2 text-xs">
                  <input type="radio" name="contactResolution" checked={contactResolution === r.value} onChange={() => onContactResolution(r.value)} className="rounded border-input" />
                  {r.label}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Nombre *</Label>
            <Input value={approveForm.contactFirstName} onChange={(e) => updateApproveForm("contactFirstName", e.target.value)} placeholder="Nombre" className={inputClassName} />
          </div>
          <div className="space-y-1.5">
            <Label>Apellido</Label>
            <Input value={approveForm.contactLastName} onChange={(e) => updateApproveForm("contactLastName", e.target.value)} placeholder="Apellido" className={inputClassName} />
          </div>
          <div className="space-y-1.5">
            <Label>Cargo</Label>
            <Input value={approveForm.roleTitle} onChange={(e) => updateApproveForm("roleTitle", e.target.value)} placeholder="Gerente, jefe..." className={inputClassName} />
          </div>
          <div className="space-y-1.5 md:col-span-2 lg:col-span-1">
            <Label>Email</Label>
            <Input value={approveForm.email} onChange={(e) => updateApproveForm("email", e.target.value)} placeholder="correo@empresa.com" className={inputClassName} />
          </div>
          <div className="space-y-1.5">
            <Label>Teléfono</Label>
            <Input value={approveForm.phone} onChange={(e) => updateApproveForm("phone", e.target.value)} placeholder="+56 9 1234 5678" className={inputClassName} />
          </div>
        </div>
      </div>
    </LedgerRow>
  );
}
