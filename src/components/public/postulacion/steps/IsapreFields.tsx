"use client";

import type { Dispatch, SetStateAction } from "react";
import { Input } from "@/components/ui/input";
import { ISAPRES_CHILE } from "@/lib/personas";
import type { PostulacionForm } from "../types";
import { CONTROL_H, FieldError, WizardSelect } from "../fields";

interface Props {
  form: PostulacionForm;
  setForm: Dispatch<SetStateAction<PostulacionForm>>;
  isapreHasExtraPercent: boolean;
  setIsapreHasExtraPercent: Dispatch<SetStateAction<boolean>>;
  errors: Record<string, string>;
}

export function IsapreFields({ form, setForm, isapreHasExtraPercent, setIsapreHasExtraPercent, errors }: Props) {
  return (
    <>
      <div>
        <WizardSelect
          invalid={Boolean(errors.isapreName)}
          value={form.isapreName}
          onChange={(e) => setForm((prev) => ({ ...prev, isapreName: e.target.value }))}
        >
          <option value="">Isapre *</option>
          {ISAPRES_CHILE.map((isapre) => (
            <option key={isapre} value={isapre}>
              {isapre}
            </option>
          ))}
        </WizardSelect>
        <FieldError message={errors.isapreName} />
      </div>
      <WizardSelect
        value={isapreHasExtraPercent ? "si" : "no"}
        onChange={(e) => setIsapreHasExtraPercent(e.target.value === "si")}
      >
        <option value="no">Cotiza solo 7%</option>
        <option value="si">Cotiza sobre 7%</option>
      </WizardSelect>
      <div className="sm:col-span-2">
        <Input
          className={CONTROL_H}
          type="number"
          step="0.01"
          min="7.01"
          placeholder="Porcentaje cotización ISAPRE"
          value={form.isapreExtraPercent}
          disabled={!isapreHasExtraPercent}
          onChange={(e) => setForm((prev) => ({ ...prev, isapreExtraPercent: e.target.value }))}
        />
        <FieldError message={errors.isapreExtraPercent} />
      </div>
    </>
  );
}
