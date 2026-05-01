"use client";

import { Shield } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface FiscalizacionDTButtonProps {
  userRole?: string;
  className?: string;
}

/**
 * Botón "Fiscalización D.T." — Resolución N°38
 * Visible en la esquina superior derecha para inspectores DT.
 * Solo se muestra si el usuario tiene rol inspector_dt.
 */
export function FiscalizacionDTButton({
  userRole,
  className,
}: FiscalizacionDTButtonProps) {
  if (userRole !== "inspector_dt") return null;

  return (
    <Link
      href="/fiscalizacion"
      className={cn(
        "inline-flex items-center gap-2 rounded-lg px-3 py-1.5",
        "bg-status-danger text-white font-semibold text-sm",
        "hover:bg-red-700 transition-colors shadow-sm",
        "animate-in fade-in duration-300",
        className
      )}
    >
      <Shield className="h-4 w-4" />
      Fiscalización D.T.
    </Link>
  );
}
