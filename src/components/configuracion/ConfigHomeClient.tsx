"use client";

import Link from "next/link";
import { ChevronRight, Settings, Shield } from "lucide-react";
import { useConfigCategories } from "@/components/opai-ds";
import { useRoleSimulation } from "@/contexts/RoleSimulationContext";
import { ConfigSearch } from "@/components/configuracion/ConfigSearch";

/**
 * Página de bienvenida de Configuración (root /opai/configuracion).
 *
 * Consume `useConfigCategories()` — la MISMA fuente que el sub-sidebar
 * (ConfigShell) — así el home y el sidebar comparten una sola taxonomía.
 * El sidebar persistente ya muestra todas las secciones a la izquierda; acá
 * damos un buscador rápido + accesos directos a la primera sección de cada
 * categoría visible.
 */
export function ConfigHomeClient() {
  const { groups } = useConfigCategories();
  const { effectiveRole } = useRoleSimulation();
  const isAdmin = effectiveRole === "owner" || effectiveRole === "admin";

  // Top 6 accesos: primera sección de cada categoría visible.
  const quickAccess = groups.flatMap((g) => g.items.slice(0, 1)).slice(0, 6);

  return (
    <div className="space-y-6 min-w-0">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
            Configuración
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Administración global y por módulo. Usa el buscador o el menú a la
          izquierda para navegar.
        </p>
      </div>

      {/* Buscador rápido */}
      <ConfigSearch groups={groups} />

      {/* Accesos rápidos: top 1 de cada categoría visible. Compacto. */}
      {quickAccess.length > 0 && (
        <section className="space-y-2">
          <p className="text-[11px] font-mono uppercase tracking-[0.08em] text-muted-foreground">
            Accesos rápidos
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {quickAccess.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3 hover:bg-accent/30 transition-colors"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/15 transition-colors">
                    <Icon className="h-[18px] w-[18px]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{item.label}</p>
                    {item.description && (
                      <p className="text-xs text-muted-foreground truncate">
                        {item.description}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0 group-hover:translate-x-0.5 transition-all" />
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Portal del Guardia (solo admin) */}
      {isAdmin && (
        <section className="space-y-2">
          <p className="text-[11px] font-mono uppercase tracking-[0.08em] text-muted-foreground">
            Portales externos
          </p>
          <Link
            href="/portal/guardia"
            target="_blank"
            className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3 hover:bg-accent/30 transition-colors"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-status-ok-soft text-status-ok-fg">
              <Shield className="h-[18px] w-[18px]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Portal del Guardia</p>
              <p className="text-xs text-muted-foreground truncate">
                Autoservicio — tickets, pautas, marcaciones y perfil
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0 group-hover:translate-x-0.5 transition-transform" />
          </Link>
          <p className="text-[11px] text-muted-foreground">
            Comparte{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-[11px]">
              /portal/guardia
            </code>{" "}
            con tus guardias. Login con RUT + PIN.
          </p>
        </section>
      )}
    </div>
  );
}
