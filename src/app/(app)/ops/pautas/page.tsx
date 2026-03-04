import { redirect } from "next/navigation";

/**
 * Pautas: hub que agrupa pauta mensual, diaria, turnos extra, PPC.
 * Redirige al dashboard de operaciones.
 */
export default function OpsPautasPage() {
  redirect("/ops");
}
