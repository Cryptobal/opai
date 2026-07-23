"use client";

import Link from "next/link";
import { ChevronRight, Settings, Shield } from "lucide-react";
import { useConfigCategories } from "@/components/opai-ds";
import { getConfigCategory } from "@/lib/nav/registry";
import { useRoleSimulation } from "@/contexts/RoleSimulationContext";
import { ConfigSearch } from "@/components/configuracion/ConfigSearch";

/**
 * Hub de Configuración (nivel 1, root /opai/configuracion).
 *
 * Consume `useConfigCategories()` — la MISMA fuente que el sub-sidebar
 * (ConfigShell) — así el hub y el sidebar comparten una sola taxonomía.
 * Muestra un buscador global + una tarjeta por categoría visible (ícono,
 * label, descripción y conteo de secciones). Cada tarjeta navega al nivel 2
 * (`/opai/configuracion/<categoria>`).
 */
export function ConfigHomeClient() {
  const { groups } = useConfigCategories();
  const { effectiveRole } = useRoleSimulation();
  const isAdmin = effectiveRole === "owner" || effectiveRole === "admin";

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
          Administración global y por módulo. Usa el buscador o elige una
          categoría para navegar.
        </p>
      </div>

      {/* Buscador global (cubre las 25 secciones en todos los niveles) */}
      <ConfigSearch groups={groups} />

      {/* Tarjetas de categoría */}
      {groups.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No tienes secciones de configuración disponibles con tu rol actual.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {groups.map((group) => {
            const meta = getConfigCategory(group.key);
            const Icon = meta?.icon ?? Settings;
            const count = group.items.length;
            return (
              <Link
                key={group.key}
                href={meta?.href ?? "/opai/configuracion"}
                className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-4 hover:bg-accent/30 hover:border-border/80 transition-colors min-h-[44px]"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/15 transition-colors">
                    <Icon className="h-5 w-5" />
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                </div>
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-semibold truncate">{group.label}</p>
                  {meta?.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {meta.description}
                    </p>
                  )}
                </div>
                <p className="text-[11px] font-mono uppercase tracking-[0.08em] text-muted-foreground">
                  {count} {count === 1 ? "sección" : "secciones"}
                </p>
              </Link>
            );
          })}
        </div>
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
          <p className="text-xs text-muted-foreground">
            Comparte{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-xs">
              /portal/guardia
            </code>{" "}
            con tus guardias. Login con RUT + PIN.
          </p>
        </section>
      )}
    </div>
  );
}
