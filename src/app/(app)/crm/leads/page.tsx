/**
 * CRM Leads Page
 */

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/opai-ds";
import { Inbox } from "lucide-react";
import { CrmLeadsClient } from "@/components/crm";

type LeadStatusFilter = "all" | "pending" | "approved" | "rejected";

function normalizeLeadStatusFilter(value?: string): LeadStatusFilter {
  if (value === "pending" || value === "approved" || value === "rejected") return value;
  return "pending";
}

export default async function CrmLeadsPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const initialStatusFilter = normalizeLeadStatusFilter(resolvedSearchParams?.status);

  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/crm/leads");
  }
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "crm", "leads")) redirect("/crm");
  const tenantId = session.user.tenantId;
  const leads = await prisma.crmLead.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });

  const initialLeads = JSON.parse(JSON.stringify(leads));

  return (
    <>
      <PageHero
        icon={<Inbox />}
        iconTone="violet"
        eyebrow={["Comercial", "Leads"]}
        title="Prospectos"
        subtitle="solicitudes entrantes y aprobación manual"
        description="Revisa, aprueba o rechaza leads recibidos por el cotizador web, email o entrada manual."
      />
      <CrmLeadsClient
        initialLeads={initialLeads}
        initialStatusFilter={initialStatusFilter}
        userRole={session.user?.role ?? ""}
      />
    </>
  );
}
