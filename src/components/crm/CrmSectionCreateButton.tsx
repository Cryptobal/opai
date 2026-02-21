"use client";

import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface CrmSectionCreateButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  size?: "sm" | "default" | "lg";
}

/**
 * Botón de creación para secciones CRM.
 * Estilo consistente con color identificatorio (verde) para crear/agregar.
 * Visible en header de sección (contraída o extendida).
 */
export function CrmSectionCreateButton({
  children,
  size = "sm",
  className,
  ...rest
}: CrmSectionCreateButtonProps) {
  return (
    <Button
      size={size}
      className={`gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border-0 ${className ?? ""}`}
      {...rest}
    >
      <Plus className="h-3.5 w-3.5" />
      {children}
    </Button>
  );
}
