"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Settings } from "lucide-react";
import { useConfigCategories } from "@/components/opai-ds";
import { getConfigCategory } from "@/lib/nav/registry";
import { ConfigBreadcrumb } from "@/components/configuracion/ConfigBreadcrumb";
import { ConfigSearch } from "@/components/configuracion/ConfigSearch";

/**
 * Nivel 2 de Configuración: lista de secciones de una categoría.
 *
 * Consume `useConfigCategories()` (misma taxonomía que hub + sidebar) y toma el
 * grupo correspondiente al slug. Renderiza breadcrumb `Configuración / Categoría`
 * + lista de secciones visibles (filtradas por permisos). Si la categoría no
 * tiene secciones visibles para el rol efectivo, muestra estado vacío.
 */
export function ConfigCategoryClient({ slug }: { slug: string }) {
  const { groups } = useConfigCategories();
  const meta = getConfigCategory(slug);
  const group = groups.find((g) => g.key === slug);
  const items = group?.items ?? [];
  const CategoryIcon = meta?.icon ?? Settings;
  const label = meta?.label ?? "Configuración";

  return (
    <div className="space-y-5 min-w-0">
      <ConfigBreadcrumb
        crumbs={[
          { label: "Configuración", href: "/opai/configuracion" },
          { label },
        ]}
      />

      {/* Header */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/20">
          <CategoryIcon className="h-[20px] w-[20px]" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-semibold tracking-tight truncate">{label}</h1>
          {meta?.description && (
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 line-clamp-2">
              {meta.description}
            </p>
          )}
        </div>
      </div>

      {/* Buscador global (cubre las 25 secciones, no acotado a la categoría) */}
      <ConfigSearch groups={groups} />

      {/* Lista de secciones */}
      {items.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            No hay secciones disponibles en esta categoría con tu rol actual.
          </p>
          <Link
            href="/opai/configuracion"
            className="inline-flex items-center gap-1 text-sm text-primary/90 hover:text-primary transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Volver a Configuración</span>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.key}
                href={item.href}
                className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3 hover:bg-accent/30 hover:border-border/80 transition-colors min-h-[44px]"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/15 transition-colors">
                  <Icon className="h-[18px] w-[18px]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{item.label}</p>
                  {item.description && (
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {item.description}
                    </p>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
