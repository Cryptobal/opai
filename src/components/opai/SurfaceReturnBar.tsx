"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions-context";
import { useTenantModules } from "@/contexts/TenantModulesContext";
import {
  isProductividadPath,
  resolveProductividadLanding,
  type Surface,
} from "@/lib/surface";

export const LAST_PRODUCTIVIDAD_PATH_KEY = "opai-last-productividad-path";

interface SurfaceReturnBarProps {
  surface: Surface;
  className?: string;
}

/** Guarda la última ruta del portal visitada (sessionStorage). */
export function useTrackProductividadPath(surface: Surface) {
  const pathname = usePathname() ?? "";
  useEffect(() => {
    if (surface !== "productividad") return;
    if (!pathname || !isProductividadPath(pathname)) return;
    try {
      sessionStorage.setItem(LAST_PRODUCTIVIDAD_PATH_KEY, pathname);
    } catch {
      /* ignore */
    }
  }, [pathname, surface]);
}

function readLastProductividadPath(): string | null {
  try {
    return sessionStorage.getItem(LAST_PRODUCTIVIDAD_PATH_KEY);
  } catch {
    return null;
  }
}

/**
 * Barra de retorno: visible solo con superficie productividad en una ruta ERP.
 */
export function SurfaceReturnBar({ surface, className }: SurfaceReturnBarProps) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const permissions = usePermissions();
  const { isModuleEnabled } = useTenantModules();

  useTrackProductividadPath(surface);

  if (surface !== "productividad") return null;
  if (!pathname || isProductividadPath(pathname)) return null;

  const goBack = () => {
    const last = readLastProductividadPath();
    const landing =
      last && isProductividadPath(last)
        ? last
        : resolveProductividadLanding(permissions, isModuleEnabled) ?? "/productividad";
    router.push(landing);
  };

  return (
    <div
      className={cn(
        "sticky top-0 z-10 flex items-center gap-2 border-b border-ds-border-subtle",
        "bg-ds-surface-1/95 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-ds-surface-1/80",
        "lg:static lg:top-auto",
        className,
      )}
      role="region"
      aria-label="Volver a Productividad"
    >
      <button
        type="button"
        onClick={goBack}
        className={cn(
          "inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-[13px] font-medium",
          "text-primary transition-colors hover:bg-primary/10 active:scale-[0.98]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        )}
      >
        <ArrowLeft className="h-4 w-4 shrink-0" />
        <Sparkles className="h-3.5 w-3.5 shrink-0" />
        <span>Volver a Productividad</span>
      </button>
    </div>
  );
}
