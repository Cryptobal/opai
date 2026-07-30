/**
 * API Route: /api/docs/documents/[id]/contacts
 *
 * GET  — Lista contactos de la cuenta asociada + cuáles ya están vinculados
 *        al documento (para el picker de revisores en la ficha).
 * POST — Asocia uno o más contactos CRM al documento (lectura/revisión).
 *        Body: { contactIds: string[] }
 *
 * DELETE — Quita asociaciones de contacto.
 *        Body: { contactIds: string[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireDocsView, requireDocsEdit } from "@/lib/api-auth-docs";

async function loadDocumentAccount(documentId: string, tenantId: string) {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, tenantId },
    select: { id: true },
  });
  if (!doc) return null;

  const accountAssoc = await prisma.docAssociation.findFirst({
    where: { documentId, entityType: "crm_account" },
    select: { entityId: true },
  });

  return { documentId: doc.id, accountId: accountAssoc?.entityId ?? null };
}

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
    const ctxDoc = await loadDocumentAccount(id, ctx.tenantId);
    if (!ctxDoc) {
      return NextResponse.json(
        { success: false, error: "Documento no encontrado" },
        { status: 404 },
      );
    }
    if (!ctxDoc.accountId) {
      return NextResponse.json({
        success: true,
        data: { accountId: null, contacts: [], associatedContactIds: [] },
      });
    }

    const [contacts, associations] = await Promise.all([
      prisma.crmContact.findMany({
        where: {
          tenantId: ctx.tenantId,
          accountId: ctxDoc.accountId,
          email: { not: null },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          roleTitle: true,
          isPrimary: true,
          portalEnabled: true,
        },
        orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }],
        take: 100,
      }),
      prisma.docAssociation.findMany({
        where: { documentId: id, entityType: "crm_contact" },
        select: { entityId: true, role: true },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        accountId: ctxDoc.accountId,
        associatedContactIds: associations.map((a) => a.entityId),
        contacts: contacts.map((c) => ({
          id: c.id,
          name: [c.firstName, c.lastName].filter(Boolean).join(" ").trim(),
          email: c.email!,
          roleTitle: c.roleTitle ?? null,
          isPrimary: c.isPrimary,
          portalEnabled: c.portalEnabled,
          associated: associations.some((a) => a.entityId === c.id),
        })),
      },
    });
  } catch (error) {
    console.error("[docs/contacts GET]", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron cargar los contactos" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireDocsEdit(ctx, "gestion");
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      contactIds?: string[];
    };
    const contactIds = Array.from(
      new Set((body.contactIds ?? []).filter((x) => typeof x === "string" && x)),
    );
    if (contactIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "Debes indicar al menos un contacto" },
        { status: 400 },
      );
    }

    const ctxDoc = await loadDocumentAccount(id, ctx.tenantId);
    if (!ctxDoc) {
      return NextResponse.json(
        { success: false, error: "Documento no encontrado" },
        { status: 404 },
      );
    }
    if (!ctxDoc.accountId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "El documento no está asociado a una cuenta. Asocia una cuenta antes de agregar contactos.",
        },
        { status: 400 },
      );
    }

    const validContacts = await prisma.crmContact.findMany({
      where: {
        tenantId: ctx.tenantId,
        accountId: ctxDoc.accountId,
        id: { in: contactIds },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        portalEnabled: true,
      },
    });
    if (validContacts.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Ningún contacto pertenece a la cuenta del documento",
        },
        { status: 400 },
      );
    }

    // El primer contacto asociado histórico queda como primary; los nuevos
    // como related (revisores adicionales).
    const existingCount = await prisma.docAssociation.count({
      where: { documentId: id, entityType: "crm_contact" },
    });

    await prisma.docAssociation.createMany({
      data: validContacts.map((c, idx) => ({
        documentId: id,
        entityType: "crm_contact",
        entityId: c.id,
        role: existingCount === 0 && idx === 0 ? "primary" : "related",
      })),
      skipDuplicates: true,
    });

    await prisma.docHistory.create({
      data: {
        documentId: id,
        action: "contacts_associated",
        details: {
          contactIds: validContacts.map((c) => c.id),
          emails: validContacts.map((c) => c.email).filter(Boolean),
        },
        createdBy: ctx.userId,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        added: validContacts.map((c) => ({
          id: c.id,
          name: [c.firstName, c.lastName].filter(Boolean).join(" ").trim(),
          email: c.email,
          portalEnabled: c.portalEnabled,
        })),
      },
    });
  } catch (error) {
    console.error("[docs/contacts POST]", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron asociar los contactos" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireDocsEdit(ctx, "gestion");
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      contactIds?: string[];
    };
    const contactIds = Array.from(
      new Set((body.contactIds ?? []).filter((x) => typeof x === "string" && x)),
    );
    if (contactIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "Debes indicar al menos un contacto" },
        { status: 400 },
      );
    }

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

    const deleted = await prisma.docAssociation.deleteMany({
      where: {
        documentId: id,
        entityType: "crm_contact",
        entityId: { in: contactIds },
      },
    });

    if (deleted.count > 0) {
      await prisma.docHistory.create({
        data: {
          documentId: id,
          action: "contacts_disassociated",
          details: { contactIds },
          createdBy: ctx.userId,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: { removed: deleted.count },
    });
  } catch (error) {
    console.error("[docs/contacts DELETE]", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron quitar los contactos" },
      { status: 500 },
    );
  }
}
