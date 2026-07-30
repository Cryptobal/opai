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

/**
 * Variante batch de `useThemeColor`: resuelve varias CSS vars con un solo
 * observer. Pensada para dashboards de Recharts, que necesitan grilla, ejes,
 * tooltip y series al mismo tiempo.
 *
 * `names` se lee por su contenido, no por identidad de array, así que el call
 * site puede pasar un literal inline sin memoizarlo.
 */
export function useThemeColors<T extends string>(names: readonly T[]): Record<T, string> {
  const key = names.join("|");
  const [colors, setColors] = useState<Record<T, string>>(
    () => Object.fromEntries(names.map((n) => [n, "transparent"])) as Record<T, string>,
  );
  useEffect(() => {
    const list = key.split("|") as T[];
    const resolve = () =>
      setColors(
        Object.fromEntries(list.map((n) => [n, resolveCSSVarColor(n)])) as Record<T, string>,
      );
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
  }, [key]);
  return colors;
}
