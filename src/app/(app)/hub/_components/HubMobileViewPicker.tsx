"use client";

/**
 * HubMobileViewPicker — selector de vista del Centro de Control en mobile.
 *
 * Solo se renderiza bajo `lg` (en desktop el ModuleSubNav cubre este rol).
 * Consume los hijos visibles del nodo `hub` del registry vía
 * `getHubViewOptions` — no duplica rutas ni permisos. Navega con las rutas
 * reales `/hub` y `/hub/[view]`.
 */

import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTenantModules } from "@/contexts/TenantModulesContext";
import { useEffectivePermissions } from "@/hooks/useEffectivePermissions";
import type { VisibilityContext } from "@/lib/nav/registry";
import {
  getActiveHubViewHref,
  getHubViewOptions,
} from "../_lib/hub-view-options";

export function HubMobileViewPicker() {
  const pathname = usePathname() ?? "/hub";
  const router = useRouter();
  const permissions = useEffectivePermissions();
  const { isModuleEnabled, hasFeatureFlag } = useTenantModules();

  const ctx: VisibilityContext = useMemo(
    () => ({
      perms: permissions,
      isAdmin: false,
      isModuleEnabled,
      hasTenantFlag: hasFeatureFlag,
    }),
    [permissions, isModuleEnabled, hasFeatureFlag],
  );

  const options = useMemo(() => getHubViewOptions(ctx), [ctx]);
  const activeHref = getActiveHubViewHref(pathname, options) ?? "/hub";

  // Con una sola vista visible no hay nada que seleccionar.
  if (options.length <= 1) return null;

  return (
    <div className="min-w-0 lg:hidden">
      <div className="mb-1.5 flex items-center gap-1.5">
        <LayoutDashboard className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span
          id="hub-view-picker-label"
          className="text-[12px] font-medium uppercase tracking-wide text-ds-text-3"
        >
          Centro de control
        </span>
      </div>
      <Select
        value={activeHref}
        onValueChange={(href) => {
          if (href !== activeHref) router.push(href);
        }}
      >
        <SelectTrigger
          aria-labelledby="hub-view-picker-label"
          aria-label="Vista del Centro de Control"
          className="h-11 w-full min-w-0 rounded-ds-md text-[13px] font-medium"
        >
          <span className="flex min-w-0 items-center gap-1.5 truncate">
            <span className="shrink-0 text-ds-text-3">Vista:</span>
            <SelectValue placeholder="General" />
          </span>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem
              key={option.key}
              value={option.href}
              className="min-h-11 text-[13px]"
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
