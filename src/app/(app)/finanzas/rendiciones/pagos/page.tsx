// Página legacy: el listado histórico de pagos se movió a `/historial-pagos`
// y la creación de pagos se hace ahora desde la lista unificada de rendiciones.
// Mantenemos este redirect para no romper bookmarks.
import { redirect } from "next/navigation";

export default function PagosLegacyPage() {
  redirect("/finanzas/rendiciones/historial-pagos");
}
