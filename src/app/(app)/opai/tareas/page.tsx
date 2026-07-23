import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView, canEdit } from "@/lib/permissions-server";
import { TareasPageClient } from "@/components/tareas/TareasPageClient";

export const metadata = { title: "Tareas · Productividad" };

export default async function TareasPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/tareas");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "productividad", "tareas")) {
    redirect("/hub");
  }
  // Crear/editar: productividad.tareas edit O crm.deals edit (mismo criterio que
  // la API). Con sólo `view` la página es de lectura.
  const canEditTasks =
    canEdit(perms, "productividad", "tareas") || canEdit(perms, "crm", "deals");

  return <TareasPageClient canEdit={canEditTasks} />;
}
