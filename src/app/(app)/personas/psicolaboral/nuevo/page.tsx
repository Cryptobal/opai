import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isTenantModuleEnabled } from "@/lib/tenant-modules";
import PsychCreateForm from "@/components/psych/dashboard/PsychCreateForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nueva evaluación psicolaboral" };

export default async function PsychCreatePage() {
  const session = await auth();
  if (!session?.user) redirect("/opai/login?callbackUrl=/personas/psicolaboral/nuevo");
  const enabled = await isTenantModuleEnabled(session.user.tenantId, "psych");
  if (!enabled) redirect("/personas/psicolaboral");

  return (
    <div className="space-y-4">
      <PsychCreateForm />
    </div>
  );
}
