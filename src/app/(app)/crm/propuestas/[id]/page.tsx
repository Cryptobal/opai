/**
 * CRM — Workspace de propuesta multi-instalación (bundle CPQ)
 */

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { BundleWorkspace } from "@/components/cpq/bundle/BundleWorkspace";
import { z } from "zod";

const uuidSchema = z.string().uuid();

export default async function CrmPropuestaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect(`/opai/login?callbackUrl=/crm/propuestas/${id}`);
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "cpq") && !canView(perms, "crm", "quotes")) {
    redirect("/crm");
  }
  const tenantId = session.user.tenantId;
  if (!uuidSchema.safeParse(id).success) {
    redirect("/crm/cotizaciones");
  }

  const bundle = await prisma.cpqProposalBundle.findFirst({
    where: { id, tenantId },
    select: { id: true },
  });
  if (!bundle) {
    redirect("/crm/cotizaciones");
  }

  return (
    <div className="min-w-0 px-3 sm:px-4 py-4">
      <BundleWorkspace bundleId={bundle.id} />
    </div>
  );
}
