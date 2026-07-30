/**
 * CRM — Propuesta multi-instalación (bundle CPQ).
 *
 * El workspace unificado vive en la cotización (`/crm/cotizaciones/[id]`): esta
 * ruta se conserva por compatibilidad con enlaces existentes y redirige a la
 * cotización primaria de la propuesta, validando el acceso antes de redirigir.
 */

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolvePagePerms, canView } from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
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
    select: {
      id: true,
      quotes: {
        orderBy: { displayOrder: "asc" },
        take: 1,
        select: { quoteId: true },
      },
    },
  });
  if (!bundle) {
    redirect("/crm/cotizaciones");
  }

  const primaryQuoteId = bundle.quotes[0]?.quoteId;
  redirect(
    primaryQuoteId ? `/crm/cotizaciones/${primaryQuoteId}` : "/crm/cotizaciones",
  );
}
