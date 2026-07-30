"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CrmStructureContact } from "@/modules/crm/email/email-to-crm-structure.types";

type Props = {
  contact: CrmStructureContact;
  onChange: (field: keyof CrmStructureContact, value: string | null) => void;
};

export function PlanContactForm({ contact, onChange }: Props) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <FormField
          id="ct-first"
          label="Nombre"
          value={contact.firstName ?? ""}
          onChange={(v) => onChange("firstName", v || null)}
        />
        <FormField
          id="ct-last"
          label="Apellido"
          value={contact.lastName ?? ""}
          onChange={(v) => onChange("lastName", v || null)}
        />
      </div>
      <FormField
        id="ct-email"
        label="Email"
        type="email"
        value={contact.email ?? ""}
        onChange={(v) => onChange("email", v || null)}
      />
      <FormField
        id="ct-phone"
        label="Teléfono"
        type="tel"
        value={contact.phone ?? ""}
        onChange={(v) => onChange("phone", v || null)}
      />
      <FormField
        id="ct-role"
        label="Cargo"
        value={contact.roleTitle ?? ""}
        onChange={(v) => onChange("roleTitle", v || null)}
      />
    </div>
  );
}

function FormField({
  id,
  label,
  value,
  onChange,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-[12px] text-ds-text-3">
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 text-ds-body sm:h-9"
      />
    </div>
  );
}
