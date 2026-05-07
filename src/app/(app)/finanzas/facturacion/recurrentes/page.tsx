import { redirect } from "next/navigation";

/**
 * /finanzas/facturacion/recurrentes
 *
 * Esta page existe solo para compatibilidad de deeplinks. El flujo real
 * de gestión de plantillas vive embebido dentro de la pestaña
 * "Programación" del módulo Facturación, junto con los borradores libres.
 * El usuario no debería tener 2 lugares distintos donde gestionar lo
 * mismo. Redirigimos siempre.
 */
export default function RecurrentesPageRedirect() {
  redirect("/finanzas/facturacion?tab=borradores");
}
