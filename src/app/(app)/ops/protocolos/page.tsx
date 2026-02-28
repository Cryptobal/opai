import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { PageHeader } from "@/components/opai";
import { ProtocolosListClient } from "@/components/ops/protocols/ProtocolosListClient";

export default async function OpsProtocolosPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/ops/protocolos");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "ops")) {
    redirect("/hub");
  }

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader
        title="Protocolos"
        description="Gestión de protocolos de seguridad por instalación."
      />
      <ProtocolosListClient />
    </div>
  );
}
