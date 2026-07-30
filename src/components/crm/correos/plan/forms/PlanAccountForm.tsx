"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CrmStructureProposal } from "@/modules/crm/email/email-to-crm-structure.types";

type Props = {
  account: CrmStructureProposal["account"];
  accountReused?: boolean;
  accountUrl?: string;
  onChange: (field: keyof CrmStructureProposal["account"], value: string | null) => void;
};

export function PlanAccountForm({ account, accountReused, accountUrl, onChange }: Props) {
  if (accountReused) {
    return (
      <div className="space-y-2 text-ds-body text-ds-text-2">
        <p className="font-medium text-ds-text-1">{account.name ?? "Cuenta existente"}</p>
        {account.rut && <p className="text-ds-text-3">RUT: {account.rut}</p>}
        {accountUrl && (
          <Link
            href={accountUrl}
            target="_blank"
            className="inline-flex min-h-10 items-center gap-1 text-primary ds-tap"
          >
            Ver cuenta <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <FormField
        id="acc-name"
        label="Nombre de la empresa"
        value={account.name ?? ""}
        onChange={(v) => onChange("name", v || null)}
      />
      <FormField
        id="acc-rut"
        label="RUT"
        value={account.rut ?? ""}
        onChange={(v) => onChange("rut", v || null)}
      />
      <FormField
        id="acc-legal"
        label="Razón social"
        value={account.legalName ?? ""}
        onChange={(v) => onChange("legalName", v || null)}
      />
      <FormField
        id="acc-industry"
        label="Industria"
        value={account.industry ?? ""}
        onChange={(v) => onChange("industry", v || null)}
      />
      <FormField
        id="acc-segment"
        label="Segmento"
        value={account.segment ?? ""}
        onChange={(v) => onChange("segment", v || null)}
      />
    </div>
  );
}

function FormField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-[12px] text-ds-text-3">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 text-ds-body sm:h-9"
      />
    </div>
  );
}
