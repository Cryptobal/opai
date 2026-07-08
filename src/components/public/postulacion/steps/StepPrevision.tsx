"use client";

import type { Dispatch, SetStateAction } from "react";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { AFP_CHILE, BANK_ACCOUNT_TYPES, CHILE_BANKS, HEALTH_SYSTEMS } from "@/lib/personas";
import type { PostulacionForm } from "../types";
import { CONTROL_H, FieldError, WizardSelect } from "../fields";
import { IsapreFields } from "./IsapreFields";

interface Props {
  form: PostulacionForm;
  setForm: Dispatch<SetStateAction<PostulacionForm>>;
  healthSystem: string;
  setHealthSystem: Dispatch<SetStateAction<string>>;
  isapreHasExtraPercent: boolean;
  setIsapreHasExtraPercent: Dispatch<SetStateAction<boolean>>;
  errors: Record<string, string>;
}

export function StepPrevision({
  form,
  setForm,
  healthSystem,
  setHealthSystem,
  isapreHasExtraPercent,
  setIsapreHasExtraPercent,
  errors,
}: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <WizardSelect
          invalid={Boolean(errors.afp)}
          value={form.afp}
          onChange={(e) => setForm((prev) => ({ ...prev, afp: e.target.value }))}
        >
          <option value="">AFP *</option>
          {AFP_CHILE.map((afp) => (
            <option key={afp} value={afp}>
              {afp}
            </option>
          ))}
        </WizardSelect>
        <FieldError message={errors.afp} />
      </div>
      <WizardSelect
        value={healthSystem}
        onChange={(e) => {
          setHealthSystem(e.target.value);
          if (e.target.value !== "isapre") {
            setForm((prev) => ({ ...prev, isapreName: "", isapreExtraPercent: "" }));
            setIsapreHasExtraPercent(false);
          }
        }}
      >
        {HEALTH_SYSTEMS.map((health) => (
          <option key={health} value={health}>
            Salud: {health.toUpperCase()}
          </option>
        ))}
      </WizardSelect>
      {healthSystem === "isapre" ? (
        <IsapreFields
          form={form}
          setForm={setForm}
          isapreHasExtraPercent={isapreHasExtraPercent}
          setIsapreHasExtraPercent={setIsapreHasExtraPercent}
          errors={errors}
        />
      ) : null}
      <WizardSelect
        value={form.hasMobilization}
        onChange={(e) => setForm((prev) => ({ ...prev, hasMobilization: e.target.value }))}
      >
        <option value="si">Tiene movilización</option>
        <option value="no">No tiene movilización</option>
      </WizardSelect>
      <WizardSelect
        value={form.availableExtraShifts}
        onChange={(e) => setForm((prev) => ({ ...prev, availableExtraShifts: e.target.value }))}
      >
        <option value="si">Disponible para turnos extra</option>
        <option value="no">No disponible para turnos extra</option>
      </WizardSelect>
      <div>
        <SearchableSelect
          value={form.bankCode}
          options={CHILE_BANKS.map((bank) => ({ id: bank.code, label: bank.name }))}
          placeholder="Banco *"
          emptyText="Sin bancos"
          onChange={(id) => setForm((prev) => ({ ...prev, bankCode: id }))}
        />
        <FieldError message={errors.bankCode} />
      </div>
      <div>
        <WizardSelect
          invalid={Boolean(errors.accountType)}
          value={form.accountType}
          onChange={(e) => setForm((prev) => ({ ...prev, accountType: e.target.value }))}
        >
          <option value="">Tipo de cuenta *</option>
          {BANK_ACCOUNT_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </WizardSelect>
        <FieldError message={errors.accountType} />
      </div>
      <div className="sm:col-span-2">
        <Input
          className={CONTROL_H}
          placeholder="Número de cuenta *"
          value={form.accountNumber}
          onChange={(e) => setForm((prev) => ({ ...prev, accountNumber: e.target.value }))}
        />
        <FieldError message={errors.accountNumber} />
      </div>
    </div>
  );
}
