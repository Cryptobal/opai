"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { getConfigCategoryOf, getConfigSectionOf } from "@/lib/nav/registry";
import { ConfigBreadcrumb, type Crumb } from "@/components/configuracion/ConfigBreadcrumb";

interface ConfigPageLayoutProps {
  title: string;
  description?: string;
  /** Pasar elemento JSX (p. ej. `<Building className="h-[18px] w-[18px]" />`), no el componente en sí: los Server Components no pueden pasar referencias de función a Client Components. */
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /** Override opcional del crumb de sección padre (para subpáginas anidadas
   *  como integraciones/slack o finanzas/dte). Si se omite, el breadcrumb se
   *  deriva del registry por longest-prefix. */
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
  backHref,
  backLabel,
  className,
}: ConfigPageLayoutProps) {
  const pathname = usePathname() ?? "";
  const category = getConfigCategoryOf(pathname);
  const section = getConfigSectionOf(pathname);

  // Breadcrumb: Configuración / [Categoría] / [Sección padre] / [Página].
  const crumbs: Crumb[] = [{ label: "Configuración", href: "/opai/configuracion" }];
  if (category) crumbs.push({ label: category.label, href: category.href });
  if (backHref) {
    // Override explícito (subpágina anidada declarando su sección padre).
    crumbs.push({ label: backLabel ?? section?.label ?? title, href: backHref });
  } else if (section && section.href !== pathname) {
    // Subpágina derivada del registry: la sección es un ancestro, no la hoja.
    crumbs.push({ label: section.label, href: section.href });
  }
  crumbs.push({ label: title });

  return (
    <div className={cn("space-y-5 min-w-0", className)}>
      <div className="relative overflow-hidden rounded-3xl opai-liquid-glass p-5 sm:p-6">
        <div className="space-y-3">
          <ConfigBreadcrumb crumbs={crumbs} />
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
