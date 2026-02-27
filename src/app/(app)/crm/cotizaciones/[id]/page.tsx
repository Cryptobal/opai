/**
 * CRM - Detalle de Cotización (CPQ)
 */

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";
import { Breadcrumb } from "@/components/opai";
import { CpqQuoteDetail } from "@/components/cpq/CpqQuoteDetail";
import { CpqIndicators } from "@/components/cpq/CpqIndicators";
import { NotesProvider } from "@/components/notes";
import { z } from "zod";

const uuidSchema = z.string().uuid();

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
  const perms = await resolvePagePerms(session.user);
  if (!canView(perms, "crm", "quotes")) redirect("/crm");
  const tenantId = session.user?.tenantId ?? (await getDefaultTenantId());
  const isUuid = uuidSchema.safeParse(id).success;
  const quote = isUuid
    ? await prisma.cpqQuote.findFirst({
        where: { id, tenantId },
        select: { id: true, code: true },
      })
    : await prisma.cpqQuote.findFirst({
        where: { code: id, tenantId },
        select: { id: true, code: true },
      });

  if (!quote) {
    redirect("/crm/cotizaciones");
  }

  // Compatibilidad para links legacy por código o rutas antiguas.
  if (quote.id !== id) {
    redirect(`/crm/cotizaciones/${quote.id}`);
  }

  return (
    <NotesProvider
      contextType="QUOTATION"
      contextId={quote.id}
      contextLabel={`Cotización ${quote.code || ""}`}
      currentUserId={session.user.id}
      currentUserRole={session.user.role}
    >
      <Breadcrumb
        items={[
          { label: "CRM", href: "/crm" },
          { label: "Cotizaciones", href: "/crm/cotizaciones" },
          { label: quote?.code || id },
        ]}
        className="mb-4"
      />
      <div className="mb-4">
        <CpqIndicators />
      </div>
      <CpqQuoteDetail quoteId={id} currentUserId={session.user.id} />
    </NotesProvider>
  );
}
