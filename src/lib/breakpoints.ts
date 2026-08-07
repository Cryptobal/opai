/** Breakpoints Tailwind por defecto — fuente única de verdad. */
export const BP = { sm: 640, md: 768, lg: 1024, xl: 1280 } as const;

/**
 * Ancho máximo del layout táctil. Alineado con el shell:
 * MobileIsland/BottomNav usan `lg:hidden`, el sidebar `hidden lg:block`.
 * iPad vertical (744–1024) queda del lado táctil a propósito.
 */
export const TOUCH_LAYOUT_MAX = BP.lg - 1; // 1023

/** Media query canónica para layout táctil (shell móvil). */
export const TOUCH_LAYOUT_QUERY = `(max-width: ${TOUCH_LAYOUT_MAX}px)`;

/** Umbrales de la isla móvil (ocultar chat / búsqueda en viewports estrechos). */
export const ISLAND_HIDE_CHAT_MAX = 360;
export const ISLAND_HIDE_SEARCH_MAX = 320;
export const ISLAND_HIDE_CHAT_QUERY = `(max-width: ${ISLAND_HIDE_CHAT_MAX}px)`;
export const ISLAND_HIDE_SEARCH_QUERY = `(max-width: ${ISLAND_HIDE_SEARCH_MAX}px)`;

