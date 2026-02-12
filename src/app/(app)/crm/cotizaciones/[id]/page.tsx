/**
 * CRM - Detalle de Cotización (CPQ)
 */

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasCrmSubmoduleAccess } from "@/lib/module-access";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { Breadcrumb } from "@/components/opai";
import { CpqQuoteDetail } from "@/components/cpq/CpqQuoteDetail";
import { CpqIndicators } from "@/components/cpq/CpqIndicators";
import { CrmSubnav } from "@/components/crm/CrmSubnav";
import { QuoteNotesWrapper } from "@/components/crm/QuoteNotesWrapper";

export default async function CrmCotizacionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect(`/opai/login?callbackUrl=/crm/cotizaciones/${id}`);
  }
  const role = session.user.role;

  if (!hasCrmSubmoduleAccess(role, "quotes")) {
    redirect("/crm");
  }

  const tenantId = session.user?.tenantId ?? (await getDefaultTenantId());
  const quote = await prisma.cpqQuote.findFirst({
    where: { id, tenantId },
    select: { code: true },
  });

  return (
    <>
      <Breadcrumb
        items={[
          { label: "CRM", href: "/crm" },
          { label: "Cotizaciones", href: "/crm/cotizaciones" },
          { label: quote?.code || id },
        ]}
        className="mb-4"
      />
      <CrmSubnav role={role} />
      <div className="mb-4">
        <CpqIndicators />
      </div>
      <CpqQuoteDetail quoteId={id} />
      <QuoteNotesWrapper quoteId={id} currentUserId={session.user.id} />
    </>
  );
}
