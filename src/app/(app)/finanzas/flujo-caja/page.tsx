import { redirect } from "next/navigation";

/**
 * Ruta histórica del Flujo de Caja (grilla v2). El Modo Planilla la reemplazó
 * como única vista del producto (decisión del owner, 2026-07-23): esta ruta
 * ahora solo redirige a la planilla. El módulo v2 (CashflowGrid, projection,
 * auto-sync) queda en el código pero sin entrada de navegación.
 */
export default function FlujoCajaLegacyRedirect() {
  redirect("/finanzas/flujo-caja/planilla");
}
