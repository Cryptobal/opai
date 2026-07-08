"use client";

import { cn } from "@/lib/utils";

/** Altura de control táctil ≥44px (mobile-first). */
export const CONTROL_H = "h-11";

interface WizardSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

/**
 * Select nativo con estilos DS v3 y target táctil de 44px.
 * Mantiene el patrón del formulario original (primera opción como etiqueta),
 * solo reorganiza la presentación en el wizard.
 */
export function WizardSelect({ invalid, className, ...props }: WizardSelectProps) {
  return (
    <select
      className={cn(
        CONTROL_H,
        "w-full rounded-md border bg-background px-3 text-sm",
        invalid ? "border-status-danger-border" : "border-border",
        className,
      )}
      {...props}
    />
  );
}

/** Mensaje de error por campo con token danger. */
export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-status-danger-fg">{message}</p>;
}
