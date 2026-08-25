import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { LaboralesLibraryClient } from "@/components/docs/laborales/LaboralesLibraryClient";

export default async function LaboralesPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/documentos/laborales");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "docs", "laborales")) {
    redirect("/hub");
  }
  return <LaboralesLibraryClient />;
}
