import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DocumentosSubnav } from "@/components/opai/DocumentosSubnav";
import { DocDetailClient } from "@/components/docs/DocDetailClient";
import { resolvePagePerms, canView } from "@/lib/permissions-server";

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect(`/opai/login?callbackUrl=/opai/documentos/${id}`);
  }

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "docs", "gestion")) {
    redirect("/opai/inicio");
  }

  return (
    <div className="space-y-6 min-w-0">
      <DocumentosSubnav />
      <DocDetailClient documentId={id} />
    </div>
  );
}
