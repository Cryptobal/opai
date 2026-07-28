"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Building2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions-context";
import { useTenantModules } from "@/contexts/TenantModulesContext";
import {
  isProductividadPath,
  resolveProductividadLanding,
  type Surface,
} from "@/lib/surface";
import { readLastProductividadPath } from "@/lib/surface-tracking";
import { startNavProgress } from "./nav-progress-bus";

interface SurfaceSegmentProps {
  surface: Surface;
  variant: "compact" | "labeled";
  /** Isla condensada: chip de 24 px con solo el icono activo. */
  condensed?: boolean;
  className?: string;
}

const SURFACES: Array<{
  key: Surface;
  label: string;
  /** Etiqueta corta para móvil (isla): cabe sin empujar el título. */
  shortLabel: string;
  icon: typeof Sparkles;
}> = [
  { key: "erp", label: "ERP", shortLabel: "ERP", icon: Building2 },
  {
    key: "productividad",
    label: "Productividad",
    shortLabel: "Prod",
    icon: Sparkles,
  },
];

/**
 * Lógica de cambio de superficie (extraída de SurfaceSwitcher):
 * POST /api/me/surface → resuelve destino → router.push + refresh.
 * Al volver a Productividad prioriza la última ruta rastreada.
 */
export function useSurfaceSwitch(surface: Surface) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const permissions = usePermissions();
  const { isModuleEnabled } = useTenantModules();
  const [pending, startTransition] = useTransition();
  const [switching, setSwitching] = useState(false);
  const busy = pending || switching;

  const landing = resolveProductividadLanding(permissions, isModuleEnabled);

  const resolveTarget = (next: Surface): string => {
    if (next === "productividad") {
      const last = readLastProductividadPath();
      if (last && isProductividadPath(last)) return last;
      return landing ?? "/productividad";
    }
    return "/hub";
  };

  const switchTo = async (next: Surface) => {
    if (busy) return;

    // Misma cookie: si estamos en el "otro" tipo de ruta, navegar de vuelta
    // (sustituye a SurfaceReturnBar). Si ya estamos donde corresponde, no-op.
    if (next === surface) {
      if (next === "productividad" && !isProductividadPath(pathname)) {
        const target = resolveTarget("productividad");
        if (target === pathname) return;
        startNavProgress();
        startTransition(() => {
          router.push(target);
        });
      } else if (next === "erp" && isProductividadPath(pathname)) {
        startNavProgress();
        startTransition(() => {
          router.push("/hub");
        });
      }
      return;
    }

    setSwitching(true);
    try {
      const res = await fetch("/api/me/surface", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ surface: next }),
      });
      if (!res.ok) return;

      const target = resolveTarget(next);
      startNavProgress();
      startTransition(() => {
        router.push(target);
        router.refresh();
      });
    } finally {
      setSwitching(false);
    }
  };

  return { switchTo, busy, landing };
}

export function SurfaceSegment({
  surface,
  variant,
  condensed = false,
  className,
}: SurfaceSegmentProps) {
  const { switchTo, busy, landing } = useSurfaceSwitch(surface);

  if (!landing) return null;

  if (condensed) {
    const active = SURFACES.find((s) => s.key === surface) ?? SURFACES[0];
    const Icon = active.icon;
    const other = surface === "erp" ? "productividad" : "erp";
    return (
      <button
        type="button"
        disabled={busy}
        aria-label={`Superficie: ${active.label}. Cambiar`}
        onClick={() => void switchTo(other)}
        className={cn(
          "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
          "bg-primary/15 text-primary",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          "disabled:opacity-50",
          className,
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label="Cambiar superficie"
      className={cn(
        "inline-flex shrink-0 items-center rounded-full bg-ds-surface-2 p-0.5",
        "border border-ds-border-subtle",
        className,
      )}
    >
      {SURFACES.map((item) => {
        const Icon = item.icon;
        const pressed = item.key === surface;
        // Ambas opciones llevan nombre (corto en móvil) para anclar ubicación
        // sin adivinar iconos; el activo se destaca con primary.
        const labelText =
          variant === "labeled" ? item.label : item.shortLabel;
        return (
          <button
            key={item.key}
            type="button"
            aria-pressed={pressed}
            aria-label={item.label}
            title={item.label}
            disabled={busy}
            onClick={() => void switchTo(item.key)}
            className={cn(
              "inline-flex h-[30px] items-center justify-center gap-1 rounded-full px-2 transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              "motion-reduce:transition-none",
              pressed
                ? "bg-primary/15 font-medium text-primary"
                : "text-ds-text-3 hover:bg-ds-surface-3 hover:text-ds-text-1",
              busy && !pressed && "opacity-50",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="text-[12px] leading-none tracking-tight">
              {labelText}
            </span>
          </button>
        );
      })}
    </div>
  );
}
