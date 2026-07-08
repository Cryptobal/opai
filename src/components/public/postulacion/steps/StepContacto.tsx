"use client";

import type { Dispatch, SetStateAction } from "react";
import { Input } from "@/components/ui/input";
import { AddressAutocomplete, type AddressResult } from "@/components/ui/AddressAutocomplete";
import { normalizeMobileNineDigits } from "@/lib/personas";
import type { PostulacionForm } from "../types";
import { CONTROL_H, FieldError } from "../fields";

interface Props {
  form: PostulacionForm;
  setForm: Dispatch<SetStateAction<PostulacionForm>>;
  onAddressChange: (result: AddressResult) => void;
  errors: Record<string, string>;
}

export function StepContacto({ form, setForm, onAddressChange, errors }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <Input
          className={CONTROL_H}
          placeholder="Celular * (9 dígitos)"
          value={form.phoneMobile}
          maxLength={9}
          inputMode="numeric"
          onChange={(e) =>
            setForm((prev) => ({ ...prev, phoneMobile: normalizeMobileNineDigits(e.target.value).slice(0, 9) }))
          }
        />
        <FieldError message={errors.phoneMobile} />
      </div>
      <div>
        <Input
          className={CONTROL_H}
          placeholder="Email *"
          type="email"
          value={form.email}
          onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
        />
        <FieldError message={errors.email} />
      </div>
      <div className="sm:col-span-2 space-y-1.5">
        <p className="text-sm font-medium text-foreground">Dirección *</p>
        <p className="text-xs text-muted-foreground">
          Escribe calle y número; elige una sugerencia de calle (no solo el nombre del sector).
        </p>
        <AddressAutocomplete
          value={form.addressFormatted}
          onChange={onAddressChange}
          placeholder="Ej: Av. Principal 123, comuna…"
          showMap
        />
        <FieldError message={errors.addressFormatted} />
      </div>
      <Input className={CONTROL_H} placeholder="Comuna" value={form.commune} readOnly />
      <Input className={CONTROL_H} placeholder="Ciudad" value={form.city} readOnly />
      <Input className={`${CONTROL_H} sm:col-span-2`} placeholder="Región" value={form.region} readOnly />
    </div>
  );
}
