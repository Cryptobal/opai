"use client";

import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface CrmSectionCreateButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode;
}

/**
 * Botón de creación minimalista para secciones CRM (solo icono +).
 * Estilo consistente verde. Visible en header de sección (contraída o extendida).
 */
export function CrmSectionCreateButton({
  children,
  className,
  ...rest
}: CrmSectionCreateButtonProps) {
  return (
    <Button
      size="icon"
      variant="ghost"
      className={`h-8 w-8 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white border-0 ${className ?? ""}`}
      aria-label="Agregar"
      {...rest}
    >
      <Plus className="h-4 w-4" />
      {children}
    </Button>
  );
}
