/**
 * GET /api/docs/documents/[id]/suggested-cc
 *
 * Returns CRM contacts of the account associated with the document, to use as
 * suggestions for the CC field of the "Enviar a firma" modal.
 *
 * Each contact has: id, name, email, roleTitle, isPrimary.
 * Contacts without email are filtered out (CC requires an email).
 * Order: isPrimary desc, lastName asc.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireDocsView } from "@/lib/api-auth-docs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireDocsView(ctx, "gestion");
    if (forbidden) return forbidden;

    const { id } = await params;

    const doc = await prisma.document.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!doc) {
      return NextResponse.json(
        { success: false, error: "Documento no encontrado" },
        { status: 404 },
      );
    }

    const accountAssoc = await prisma.docAssociation.findFirst({
      where: { documentId: id, entityType: "crm_account" },
      select: { entityId: true },
    });
    if (!accountAssoc?.entityId) {
      return NextResponse.json({ success: true, data: [] });
    }

    const contacts = await prisma.crmContact.findMany({
      where: {
        tenantId: ctx.tenantId,
        accountId: accountAssoc.entityId,
        email: { not: null },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        roleTitle: true,
        isPrimary: true,
      },
      orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }],
      take: 50,
    });

    const data = contacts.map((c) => ({
      id: c.id,
      name: [c.firstName, c.lastName].filter(Boolean).join(" ").trim(),
      email: c.email!,
      roleTitle: c.roleTitle ?? null,
      isPrimary: c.isPrimary,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[suggested-cc]", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron cargar los contactos sugeridos" },
      { status: 500 },
    );
  }
}
