import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { RondasCentroIaClient } from "@/components/ops/rondas/RondasCentroIaClient";

export default async function RondasCentroIaPage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/ops/rondas/centro-ia");

  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "rondas")) redirect("/hub");

  return (
    <div className="min-w-0">
      <RondasCentroIaClient />
    </div>
  );
}
