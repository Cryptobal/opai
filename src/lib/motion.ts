/**
 * OPAI Refined Industrial — Motion tokens
 *
 * Duraciones y curvas estándar. Toda transición/animation del DS debe
 * consumir estos valores. Usar `transition-all` está prohibido fuera del
 * DS source — preferir `transitionProperty(["colors", "opacity", "transform"])`.
 *
 * Los valores también existen como CSS vars en globals.css:
 *   --motion-duration-fast / -base / -slow
 *   --motion-easing-standard / -emphasized
 *
 * Respetar `prefers-reduced-motion: reduce` ya está cubierto en globals.css.
 */

import type { CSSProperties } from "react";

export const motion = {
  duration: {
    /** 150ms — micro-interacciones (focus, color change, hover). */
    fast: 150,
    /** 200ms — transiciones default (sidebar, expand, padding). */
    base: 200,
    /** 300ms — overlays, modales, page entrance. */
    slow: 300,
  },
  easing: {
    /** Curva default — suave de salida, sin overshoot. */
    standard: "cubic-bezier(0.2, 0, 0, 1)",
    /** Curva con énfasis — entrada más rápida, salida más larga. */
    emphasized: "cubic-bezier(0.3, 0, 0, 1)",
  },
} as const;

export type MotionDuration = keyof typeof motion.duration;
export type MotionEasing = keyof typeof motion.easing;

/**
 * Devuelve un objeto `style` listo para pasar a un componente React.
 *
 * Ejemplo:
 *   <div style={transition(["colors", "transform"], "base")} />
 */
export function transition(
  properties: readonly string[],
  duration: MotionDuration = "base",
  easing: MotionEasing = "standard",
): CSSProperties {
  return {
    transitionProperty: properties.join(", "),
    transitionDuration: `${motion.duration[duration]}ms`,
    transitionTimingFunction: motion.easing[easing],
  };
}

/**
 * Mapeo estático de duración → className Tailwind canónica.
 * NO usar interpolación dinámica con template strings (Tailwind JIT no
 * la detecta). Estos valores deben aparecer literales en el código.
 */
export const MOTION_CLASS = {
  duration: {
    fast: "duration-150",
    base: "duration-200",
    slow: "duration-300",
  },
  easing: {
    standard: "ease-[cubic-bezier(0.2,0,0,1)]",
    emphasized: "ease-[cubic-bezier(0.3,0,0,1)]",
  },
} as const;

// Constantes en formato CSS-variable-friendly para usos directos.
export const MOTION_VARS = {
  durationFast: "var(--motion-duration-fast)",
  durationBase: "var(--motion-duration-base)",
  durationSlow: "var(--motion-duration-slow)",
  easingStandard: "var(--motion-easing-standard)",
  easingEmphasized: "var(--motion-easing-emphasized)",
} as const;
