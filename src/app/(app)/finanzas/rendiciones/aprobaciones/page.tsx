// Página legacy: el flujo de aprobaciones se consolidó en la lista unificada
// `/finanzas/rendiciones` (filtro "Mis aprobaciones"). Mantenemos esta ruta
// como redirect para no romper bookmarks/links existentes.
import { redirect } from "next/navigation";

export default function AprobacionesLegacyPage() {
  redirect("/finanzas/rendiciones?filter=my_approvals");
}
