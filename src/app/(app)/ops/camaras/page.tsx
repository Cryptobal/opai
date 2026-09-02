import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { isTenantModuleEnabled } from "@/lib/tenant-modules";
import { CamarasWallClient } from "@/components/ops/camaras/CamarasWallClient";

export default async function OpsCamarasPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/camaras");
  }
  const tenantId = session.user.tenantId;
  if (!tenantId || !(await isTenantModuleEnabled(tenantId, "ops_camaras"))) {
    redirect("/modulo-no-disponible?module=ops_camaras");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops", "camaras")) {
    redirect("/hub");
  }

  return (
    <div className="min-w-0">
      <CamarasWallClient />
    </div>
  );
}
