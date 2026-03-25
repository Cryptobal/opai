/**
 * GET /api/portal/cliente/cotizaciones/[id]/readiness
 *
 * Checks whether the client has completed all required data before accepting
 * a proposal or approving a quote. Returns a list of missing fields so the
 * UI can block acceptance and guide the user to complete them.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";
import { cpqQuoteListedInClientPortalWhere } from "@/lib/cpq-portal-visibility";

interface MissingItem {
  field: string;
  label: string;
  section: string; // "empresa" | "representantes"
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const session = parsePortalClienteSessionCookie(
    cookieStore.get("portal_cliente_session")?.value
  );
  if (!session) {
    return NextResponse.json({ error: "No session" }, { status: 401 });
  }

  const { id: quoteId } = await params;

  // Verify quote ownership
  const quote = await prisma.cpqQuote.findFirst({
    where: {
      id: quoteId,
      accountId: session.accountId,
      tenantId: session.tenantId,
      ...cpqQuoteListedInClientPortalWhere(),
    },
    select: { id: true },
  });

  if (!quote) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Fetch account data
  const account = await prisma.crmAccount.findUnique({
    where: { id: session.accountId },
    select: {
      rut: true,
      legalName: true,
      address: true,
    },
  });

  // Fetch legal representatives
  const representantes = await prisma.accountRepresentanteLegal.findMany({
    where: { accountId: session.accountId, tenantId: session.tenantId },
    select: { id: true, nombre: true, email: true },
  });

  const missing: MissingItem[] = [];

  // Required account fields
  if (!account?.rut?.trim()) {
    missing.push({ field: "rut", label: "RUT de la empresa", section: "empresa" });
  }
  if (!account?.legalName?.trim()) {
    missing.push({ field: "legalName", label: "Razón social", section: "empresa" });
  }
  if (!account?.address?.trim()) {
    missing.push({ field: "address", label: "Dirección legal", section: "empresa" });
  }

  // At least one legal representative
  if (representantes.length === 0) {
    missing.push({
      field: "representantes",
      label: "Al menos un representante legal",
      section: "representantes",
    });
  } else {
    // All representatives must have email for signature flow
    const repsWithoutEmail = representantes.filter((r) => !r.email?.trim());
    if (repsWithoutEmail.length > 0) {
      for (const rep of repsWithoutEmail) {
        missing.push({
          field: `representante_email_${rep.id}`,
          label: `Email de firma de ${rep.nombre}`,
          section: "representantes",
        });
      }
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      ready: missing.length === 0,
      missing,
      representantesCount: representantes.length,
    },
  });
}
