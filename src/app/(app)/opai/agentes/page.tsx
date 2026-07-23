import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { AgentesPageClient } from "@/components/agentes/AgentesPageClient";

export const metadata = { title: "Agentes IA · Productividad" };

export default async function AgentesPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/agentes");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "productividad", "agentes")) {
    redirect("/hub");
  }
  return <AgentesPageClient />;
}
