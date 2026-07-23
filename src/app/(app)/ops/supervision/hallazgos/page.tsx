import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { SupervisionHallazgos } from "@/components/supervision/SupervisionHallazgos";
export default async function HallazgosPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/supervision/hallazgos");
  }

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "supervision")) {
    redirect("/hub");
  }

  return (
    <div className="min-w-0">
      <SupervisionHallazgos />
    </div>
  );
}
