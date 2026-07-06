"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { parseLocalizedNumber, formatNumber } from "@/lib/utils";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

interface LocalizedNumberInputProps
  extends Omit<InputProps, "value" | "onChange" | "type"> {
  /** Valor numérico (en la unidad que ve el usuario). */
  value: number;
  /** Se llama con el número parseado en cada cambio. */
  onValueChange: (value: number) => void;
  /** Decimales máximos al formatear (fuera de edición). Default 0. */
  maxDecimals?: number;
}

/**
 * Input numérico con formato local (es-CL) que permite escribir decimales.
 *
 * El problema del patrón `value={formatNumber(...)}` controlado es que
 * reformatea en cada tecla: al escribir "8," el separador decimal se
 * elimina antes de poder escribir la parte fraccionaria. Aquí mantenemos
 * un buffer de edición mientras el input está enfocado y solo reformateamos
 * al salir (blur), preservando lo que el usuario tipea (incluido el ",").
 */
export function LocalizedNumberInput({
  value,
  onValueChange,
  maxDecimals = 0,
  inputMode,
  ...rest
}: LocalizedNumberInputProps) {
  const [draft, setDraft] = React.useState<string | null>(null);

  const display =
    draft ?? formatNumber(value, { minDecimals: 0, maxDecimals });

  return (
    <Input
      {...rest}
      type="text"
      inputMode={inputMode ?? (maxDecimals > 0 ? "decimal" : "numeric")}
      value={display}
      onChange={(e) => {
        setDraft(e.target.value);
        onValueChange(parseLocalizedNumber(e.target.value));
      }}
      onBlur={(e) => {
        setDraft(null);
        rest.onBlur?.(e);
      }}
    />
  );
}
