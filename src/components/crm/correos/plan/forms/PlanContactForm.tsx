"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { CrmStructureContact } from "@/modules/crm/email/email-to-crm-structure.types";
import { listProposalContacts } from "@/modules/crm/email/structure-contacts";

type Props = {
  contact: CrmStructureContact;
  contacts?: CrmStructureContact[] | null;
  onChange: (next: CrmStructureContact[]) => void;
};

export function PlanContactForm({ contact, contacts, onChange }: Props) {
  const list = listProposalContacts({ contact, contacts });
  const items =
    list.length > 0
      ? list
      : [
          {
            firstName: null,
            lastName: null,
            email: null,
            phone: null,
            roleTitle: null,
            selected: true,
          },
        ];

  function patch(index: number, field: keyof CrmStructureContact, value: string | boolean | null) {
    const next = items.map((c, i) => (i === index ? { ...c, [field]: value } : c));
    onChange(next);
  }

  return (
    <div className="space-y-4">
      {items.map((c, index) => {
        const checked = c.selected !== false;
        const title =
          [c.firstName, c.lastName].filter(Boolean).join(" ") ||
          c.email ||
          `Contacto ${index + 1}`;
        return (
          <div
            key={`${c.email ?? "c"}-${index}`}
            className={`space-y-3 rounded-lg border border-ds-border-subtle p-3 ${
              checked ? "bg-ds-surface-1" : "bg-ds-surface-2 opacity-70"
            }`}
          >
            <label className="flex min-h-11 items-center gap-2 text-[13px] font-medium text-ds-text-1">
              <Checkbox
                className="h-5 w-5"
                checked={checked}
                onCheckedChange={(v) => patch(index, "selected", v === true)}
                aria-label={`Incluir ${title}`}
              />
              <span className="truncate">{title}</span>
              {c.roleTitle ? (
                <span className="ml-auto shrink-0 text-[12px] font-normal text-ds-text-3">
                  {c.roleTitle}
                </span>
              ) : null}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <FormField
                id={`ct-${index}-first`}
                label="Nombre"
                value={c.firstName ?? ""}
                onChange={(v) => patch(index, "firstName", v || null)}
                disabled={!checked}
              />
              <FormField
                id={`ct-${index}-last`}
                label="Apellido"
                value={c.lastName ?? ""}
                onChange={(v) => patch(index, "lastName", v || null)}
                disabled={!checked}
              />
            </div>
            <FormField
              id={`ct-${index}-email`}
              label="Email"
              type="email"
              value={c.email ?? ""}
              onChange={(v) => patch(index, "email", v || null)}
              disabled={!checked}
            />
            <FormField
              id={`ct-${index}-phone`}
              label="Teléfono"
              type="tel"
              value={c.phone ?? ""}
              onChange={(v) => patch(index, "phone", v || null)}
              disabled={!checked}
            />
            <FormField
              id={`ct-${index}-role`}
              label="Cargo"
              value={c.roleTitle ?? ""}
              onChange={(v) => patch(index, "roleTitle", v || null)}
              disabled={!checked}
            />
          </div>
        );
      })}
    </div>
  );
}

function FormField({
  id,
  label,
  value,
  onChange,
  type = "text",
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  disabled?: boolean;
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
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 text-[13px] sm:h-9"
      />
    </div>
  );
}
