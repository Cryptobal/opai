"use client";

/**
 * Resuelve un CSS variable HSL a un string que Recharts (y otras libs que
 * no aceptan CSS vars) pueda usar como fill/stroke. Se ejecuta client-side
 * leyendo `getComputedStyle(document.documentElement)`.
 *
 * Uso:
 *   const primary = useThemeColor("--primary");
 *   <Radar stroke={primary} fill={primary} />
 */

import { useEffect, useState } from "react";

export function resolveCSSVarColor(name: string): string {
  if (typeof window === "undefined") return "#000";
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  if (!raw) return "#000";
  return `hsl(${raw})`;
}

export function useThemeColor(cssVarName: string): string {
  const [color, setColor] = useState<string>(() => "transparent");
  useEffect(() => {
    const resolve = () => setColor(resolveCSSVarColor(cssVarName));
    resolve();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const obs = new MutationObserver(resolve);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
    mq.addEventListener?.("change", resolve);
    return () => {
      obs.disconnect();
      mq.removeEventListener?.("change", resolve);
    };
  }, [cssVarName]);
  return color;
}
