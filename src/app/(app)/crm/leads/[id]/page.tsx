/**
 * CRM Lead Detail Page
 */

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { CrmLeadDetailClient } from "@/components/crm";
import { NotesProvider } from "@/components/notes";

export default async function CrmLeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect(`/opai/login?callbackUrl=/crm/leads/${id}`);
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "crm", "leads")) redirect("/crm");
  const tenantId = session.user?.tenantId ?? (await getDefaultTenantId());

  const lead = await prisma.crmLead.findFirst({
    where: { id, tenantId },
  });

  if (!lead) {
    redirect("/crm/leads");
  }

  const initialLead = JSON.parse(JSON.stringify(lead));

  return (
    <NotesProvider
      contextType="LEAD"
      contextId={id}
      contextLabel={lead.companyName || [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Lead"}
      currentUserId={session.user.id}
      currentUserRole={session.user.role}
    >
      <div className="space-y-4">
        <CrmLeadDetailClient lead={initialLead} />
      </div>
    </NotesProvider>
  );
}
