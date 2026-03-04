import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PageHeader } from "@/components/opai";
import { SupervisionGrilla } from "@/components/supervision/SupervisionGrilla";
import { NotesProvider } from "@/components/notes";

export default async function OpsSupervisionPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/supervision");
  }

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "supervision")) {
    redirect("/hub");
  }

  const params = await searchParams;
  const now = new Date();
  const year = params.year ? parseInt(params.year) : now.getFullYear();
  const month = params.month ? parseInt(params.month) : now.getMonth() + 1;

  return (
    <NotesProvider
      contextType="SUPERVISION"
      contextId="supervision-module"
      contextLabel="Supervisión"
      currentUserId={session.user.id}
      currentUserRole={session.user.role}
    >
      <div className="space-y-4 min-w-0">
        <PageHeader
          title="Grilla de supervisión"
          description="Visitas por instalación y día del mes."
        />
        <SupervisionGrilla year={year} month={month} />
      </div>
    </NotesProvider>
  );
}
