import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DocsClient } from "@/components/docs/DocsClient";
import { resolvePagePerms, canView } from "@/lib/permissions-server";

export default async function DocumentosPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/documentos");
  }

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "docs", "gestion")) {
    redirect("/hub");
  }

  return (
    <div className="min-w-0">
      <DocsClient />
    </div>
  );
}
