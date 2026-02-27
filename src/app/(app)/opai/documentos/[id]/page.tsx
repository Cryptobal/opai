import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DocumentosSubnav } from "@/components/opai/DocumentosSubnav";
import { DocDetailClient } from "@/components/docs/DocDetailClient";
import { NotesProvider } from "@/components/notes";
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
    <NotesProvider
      contextType="DOCUMENT"
      contextId={id}
      contextLabel="Documento"
      currentUserId={session.user.id}
      currentUserRole={session.user.role}
    >
      <div className="space-y-6 min-w-0">
        <DocumentosSubnav />
        <DocDetailClient documentId={id} />
      </div>
    </NotesProvider>
  );
}
