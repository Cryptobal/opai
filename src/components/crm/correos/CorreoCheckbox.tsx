"use client";

import { Check } from "lucide-react";

type Props = {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
};

/**
 * Checkbox propio con tokens del DS. El nativo renderiza la caja blanca en
 * tema oscuro (el color-scheme global solo cubre inputs de fecha), y en la
 * bandeja Gmail-style eso destella; acá la caja usa superficies/bordes DS y
 * el check es el icono sobre bg-primary.
 */
export function CorreoCheckbox({ checked, onChange, disabled, ariaLabel, className = "" }: Props) {
  return (
    <label
      className={`relative flex h-4 w-4 shrink-0 items-center justify-center ${
        disabled ? "cursor-default opacity-40" : "cursor-pointer"
      } ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        aria-label={ariaLabel}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="flex h-4 w-4 items-center justify-center rounded-[4px] border border-ds-border-strong bg-ds-surface-2 transition-colors peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ds-border-strong"
      >
        <Check
          className={`h-3 w-3 text-primary-foreground transition-opacity ${
            checked ? "opacity-100" : "opacity-0"
          }`}
        />
      </span>
    </label>
  );
}
