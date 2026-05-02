"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConfigPageLayoutProps {
  title: string;
  description?: string;
  /** Pasar elemento JSX (p. ej. `<Building className="h-[18px] w-[18px]" />`), no el componente en sí: los Server Components no pueden pasar referencias de función a Client Components. */
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  backHref?: string;
  backLabel?: string;
  className?: string;
}

export function ConfigPageLayout({
  title,
  description,
  icon,
  actions,
  children,
  backHref = "/opai/configuracion",
  backLabel = "Configuración",
  className,
}: ConfigPageLayoutProps) {
  return (
    <div className={cn("space-y-5 min-w-0", className)}>
      <div className="relative overflow-hidden rounded-3xl opai-liquid-glass p-5 sm:p-6">
        <div className="space-y-3">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-sm text-primary/90 hover:text-primary transition-colors -ml-0.5"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>{backLabel}</span>
          </Link>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              {icon && (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/20">
                  {icon}
                </div>
              )}
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-semibold tracking-tight truncate">{title}</h1>
                {description && (
                  <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 line-clamp-2">{description}</p>
                )}
              </div>
            </div>
            {actions && (
              <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>
            )}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
