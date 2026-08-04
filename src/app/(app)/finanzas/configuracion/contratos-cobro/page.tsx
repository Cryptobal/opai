import { redirect } from "next/navigation";

/**
 * Ruta histórica: la edición masiva del calendario de cobro vive ahora
 * en las programaciones (fuente real del Flujo v3).
 */
export default function ContratosCobroLegacyRedirect() {
  redirect("/finanzas/configuracion/programaciones-cobro");
}
