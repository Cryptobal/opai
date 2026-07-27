"use client";

import { useEffect } from "react";
import { useBranding } from "@/lib/branding/useBranding";
import { hexToHslComponents, withLightness } from "@/lib/branding/hex-to-hsl";

const SURFACE_KEYS = [
  "--background",
  "--card",
  "--popover",
  "--ds-surface-0",
  "--ds-surface-1",
  "--ds-surface-2",
  "--ds-surface-3",
] as const;

function applyBrandTheme(opts: {
  accentColor: string;
  secondaryColor: string;
  primaryColor: string;
}) {
  const root = document.documentElement;
  const accent =
    hexToHslComponents(opts.accentColor) ??
    hexToHslComponents(opts.secondaryColor);
  const navy = hexToHslComponents(opts.primaryColor);

  if (accent) {
    root.style.setProperty("--primary", accent);
    root.style.setProperty("--ring", accent);
  } else {
    root.style.removeProperty("--primary");
    root.style.removeProperty("--ring");
  }

  if (root.classList.contains("dark") && navy) {
    const bg = withLightness(navy, 12);
    root.style.setProperty("--background", bg);
    root.style.setProperty("--card", withLightness(navy, 15));
    root.style.setProperty("--popover", withLightness(navy, 17));
    root.style.setProperty("--ds-surface-0", bg);
    root.style.setProperty("--ds-surface-1", withLightness(navy, 14));
    root.style.setProperty("--ds-surface-2", withLightness(navy, 17));
    root.style.setProperty("--ds-surface-3", withLightness(navy, 20));
  } else {
    for (const k of SURFACE_KEYS) root.style.removeProperty(k);
  }
}

/**
 * Aplica colores de Configuración → Empresa al chrome (`--primary` y
 * superficies dark). Sin valor válido, deja los tokens del DS.
 */
export function BrandThemeSync() {
  const { branding } = useBranding();

  useEffect(() => {
    const apply = () =>
      applyBrandTheme({
        accentColor: branding.accentColor,
        secondaryColor: branding.secondaryColor,
        primaryColor: branding.primaryColor,
      });
    apply();
    const obs = new MutationObserver(apply);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => {
      obs.disconnect();
      document.documentElement.style.removeProperty("--primary");
      document.documentElement.style.removeProperty("--ring");
      for (const k of SURFACE_KEYS) {
        document.documentElement.style.removeProperty(k);
      }
    };
  }, [branding.accentColor, branding.secondaryColor, branding.primaryColor]);

  return null;
}
