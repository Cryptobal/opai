import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { DocsOperativosClient } from "@/components/docs/DocsOperativosClient";

export const metadata = { title: "Docs Operativos — OPAI" };

export default async function DocsOperativosPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/documentos-operativos");
  }

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "docs", "operativos")) {
    redirect("/hub");
  }

  return (
    <div className="min-w-0">
      <DocsOperativosClient />
    </div>
  );
}
