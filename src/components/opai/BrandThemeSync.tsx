"use client";

import { useEffect, useRef } from "react";
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
 * Aplica colores de Configuración → Empresa al chrome.
 * Si SSR ya inyectó `#opai-brand`, no escribe hasta que el branding real difiera.
 * Nunca aplica DEFAULTS.
 */
export function BrandThemeSync() {
  const { branding, fromDefaults } = useBranding();
  const lastDarkRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (fromDefaults) return;

    const ssr = document.getElementById("opai-brand");
    const accent =
      hexToHslComponents(branding.accentColor) ??
      hexToHslComponents(branding.secondaryColor);

    // Si el SSR ya pintó el mismo acento, no reescribir (evita flash).
    if (ssr && accent) {
      const current = getComputedStyle(document.documentElement)
        .getPropertyValue("--primary")
        .trim();
      if (current === accent.trim()) {
        // Solo reaccionar a cambios reales de clase dark.
        const applyDarkOnly = () => {
          const isDark = document.documentElement.classList.contains("dark");
          if (lastDarkRef.current === isDark) return;
          lastDarkRef.current = isDark;
          applyBrandTheme({
            accentColor: branding.accentColor,
            secondaryColor: branding.secondaryColor,
            primaryColor: branding.primaryColor,
          });
        };
        applyDarkOnly();
        const obs = new MutationObserver(applyDarkOnly);
        obs.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["class"],
        });
        return () => obs.disconnect();
      }
    }

    const apply = () => {
      const isDark = document.documentElement.classList.contains("dark");
      if (lastDarkRef.current === isDark) {
        // Reaplicar colores (branding cambió) aunque dark no cambió.
        applyBrandTheme({
          accentColor: branding.accentColor,
          secondaryColor: branding.secondaryColor,
          primaryColor: branding.primaryColor,
        });
        return;
      }
      lastDarkRef.current = isDark;
      applyBrandTheme({
        accentColor: branding.accentColor,
        secondaryColor: branding.secondaryColor,
        primaryColor: branding.primaryColor,
      });
    };

    apply();
    const obs = new MutationObserver(() => {
      const isDark = document.documentElement.classList.contains("dark");
      if (lastDarkRef.current === isDark) return;
      lastDarkRef.current = isDark;
      applyBrandTheme({
        accentColor: branding.accentColor,
        secondaryColor: branding.secondaryColor,
        primaryColor: branding.primaryColor,
      });
    });
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => {
      obs.disconnect();
    };
  }, [
    branding.accentColor,
    branding.secondaryColor,
    branding.primaryColor,
    fromDefaults,
  ]);

  return null;
}
