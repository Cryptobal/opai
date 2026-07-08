"use client";

import type { Dispatch, SetStateAction } from "react";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import {
  completeRutWithDv,
  formatRutForInput,
  isChileanRutFormat,
  isValidChileanRut,
  PAISES_AMERICA,
  PERSON_SEX,
} from "@/lib/personas";
import type { PostulacionForm } from "../types";
import { CONTROL_H, FieldError, WizardSelect } from "../fields";

interface Props {
  form: PostulacionForm;
  setForm: Dispatch<SetStateAction<PostulacionForm>>;
  rutError: string | null;
  setRutError: (value: string | null) => void;
  errors: Record<string, string>;
}

export function StepDatosPersonales({ form, setForm, rutError, setRutError, errors }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <Input
          className={CONTROL_H}
          placeholder="Nombre *"
          value={form.firstName}
          onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))}
        />
        <FieldError message={errors.firstName} />
      </div>
      <div>
        <Input
          className={CONTROL_H}
          placeholder="Apellido *"
          value={form.lastName}
          onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))}
        />
        <FieldError message={errors.lastName} />
      </div>
      <div className="sm:col-span-2">
        <Input
          className={CONTROL_H}
          placeholder="RUT * (sin puntos y con guión)"
          value={form.rut}
          onChange={(e) => setForm((prev) => ({ ...prev, rut: formatRutForInput(e.target.value) }))}
          onBlur={() => {
            const completed = completeRutWithDv(form.rut);
            setForm((prev) => ({ ...prev, rut: completed }));
            if (completed && (!isChileanRutFormat(completed) || !isValidChileanRut(completed))) {
              setRutError("RUT inválido. Verifica guión y dígito verificador.");
            } else {
              setRutError(null);
            }
          }}
        />
        <FieldError message={rutError ?? errors.rut} />
      </div>
      <div className="sm:col-span-2">
        <div
          className={`${CONTROL_H} flex w-full items-center gap-2 rounded-md border ${errors.birthDate ? "border-status-danger-border" : "border-input"} bg-background px-3 text-sm ring-offset-background focus-within:ring-1 focus-within:ring-ring`}
          role="group"
        >
          <input
            type="date"
            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-foreground outline-none [color-scheme:light]"
            value={form.birthDate}
            onChange={(e) => setForm((prev) => ({ ...prev, birthDate: e.target.value }))}
            id="postulacion-birthdate"
            aria-label="Fecha de nacimiento"
          />
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-8 w-8 shrink-0 border-border bg-muted/50 text-foreground hover:bg-muted"
            onClick={() =>
              (document.getElementById("postulacion-birthdate") as HTMLInputElement | null)?.showPicker?.()
            }
            title="Abrir calendario"
          >
            <CalendarDays className="h-4 w-4 text-white" />
          </Button>
          <span className="shrink-0 text-muted-foreground">Fecha de nacimiento</span>
        </div>
        <FieldError message={errors.birthDate} />
      </div>
      <div>
        <WizardSelect
          invalid={Boolean(errors.sex)}
          value={form.sex}
          onChange={(e) => setForm((prev) => ({ ...prev, sex: e.target.value }))}
        >
          <option value="">Sexo *</option>
          {PERSON_SEX.map((sex) => (
            <option key={sex} value={sex}>
              {sex}
            </option>
          ))}
        </WizardSelect>
        <FieldError message={errors.sex} />
      </div>
      <SearchableSelect
        value={form.nacionalidad}
        options={PAISES_AMERICA.map((pais) => ({ id: pais, label: pais }))}
        placeholder="Nacionalidad"
        emptyText="Sin resultados"
        onChange={(id) => setForm((prev) => ({ ...prev, nacionalidad: id }))}
      />
    </div>
  );
}
