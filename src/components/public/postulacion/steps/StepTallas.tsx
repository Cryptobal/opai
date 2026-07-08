"use client";

import type { Dispatch, SetStateAction } from "react";
import { Input } from "@/components/ui/input";
import { PANTS_SIZES, SHOE_SIZES, TOP_GARMENT_SIZES } from "@/lib/personas";
import type { PostulacionForm } from "../types";
import { CONTROL_H, WizardSelect } from "../fields";

interface Props {
  form: PostulacionForm;
  setForm: Dispatch<SetStateAction<PostulacionForm>>;
}

type GarmentKey =
  | "shoeSize"
  | "pantsSize"
  | "tshirtSize"
  | "shirtSize"
  | "geologoSize"
  | "polarSize"
  | "jacketSize";

const GARMENTS: { key: GarmentKey; label: string; options: readonly string[] }[] = [
  { key: "shoeSize", label: "Calzado", options: SHOE_SIZES },
  { key: "pantsSize", label: "Pantalón", options: PANTS_SIZES },
  { key: "tshirtSize", label: "Polera", options: TOP_GARMENT_SIZES },
  { key: "shirtSize", label: "Camisa", options: TOP_GARMENT_SIZES },
  { key: "geologoSize", label: "Geólogo", options: TOP_GARMENT_SIZES },
  { key: "polarSize", label: "Polar", options: TOP_GARMENT_SIZES },
  { key: "jacketSize", label: "Chaqueta", options: TOP_GARMENT_SIZES },
];

export function StepTallas({ form, setForm }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {GARMENTS.map(({ key, label, options }) => (
        <WizardSelect
          key={key}
          value={form[key]}
          onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
        >
          <option value="">{label}</option>
          {options.map((size) => (
            <option key={size} value={size}>
              {label} {size}
            </option>
          ))}
        </WizardSelect>
      ))}
      <Input
        className={CONTROL_H}
        type="number"
        min="120"
        max="230"
        step="0.1"
        placeholder="Estatura (cm)"
        value={form.heightCm}
        onChange={(e) => setForm((prev) => ({ ...prev, heightCm: e.target.value }))}
      />
      <Input
        className={CONTROL_H}
        type="number"
        min="35"
        max="250"
        step="0.1"
        placeholder="Peso (kg)"
        value={form.weightKg}
        onChange={(e) => setForm((prev) => ({ ...prev, weightKg: e.target.value }))}
      />
    </div>
  );
}
