/**
 * GET / POST / DELETE — contactos múltiples del hilo (Copiloto v2).
 * Tenant-scoped. Al agregar un contacto fuera de la cuenta del hilo se exige
 * `force=true` (la confirmación UX vive en el cliente).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCorreosAccess } from "@/lib/api-auth-productividad";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ threadId: string }> };

function contactName(c: { firstName: string; lastName: string }) {
  return `${c.firstName} ${c.lastName}`.trim();
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const mod = await requireCorreosAccess();
  if (!mod.authorized) return mod.response;
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const { threadId } = await params;
  const thread = await prisma.crmEmailThread.findFirst({
    where: { id: threadId, tenantId: ctx.tenantId },
    select: { id: true, contactId: true, accountId: true },
  });
  if (!thread) return NextResponse.json({ error: "Hilo no encontrado" }, { status: 404 });

  const rows = await prisma.crmEmailThreadContact.findMany({
    where: { tenantId: ctx.tenantId, threadId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      contactId: true,
      addedVia: true,
      contact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          accountId: true,
        },
      },
    },
  });

  // Si el principal no está en la puente (pre-backfill), lo incluimos en la respuesta.
  const ids = new Set(rows.map((r) => r.contactId));
  let primaryExtra: (typeof rows)[number] | null = null;
  if (thread.contactId && !ids.has(thread.contactId)) {
    const c = await prisma.crmContact.findFirst({
      where: { id: thread.contactId, tenantId: ctx.tenantId },
      select: { id: true, firstName: true, lastName: true, email: true, accountId: true },
    });
    if (c) {
      primaryExtra = {
        id: "primary",
        contactId: c.id,
        addedVia: "backfill",
        contact: c,
      };
    }
  }

  const all = primaryExtra ? [primaryExtra, ...rows] : rows;
  return NextResponse.json({
    primaryContactId: thread.contactId,
    accountId: thread.accountId,
    contacts: all.map((r) => ({
      id: r.id,
      contactId: r.contactId,
      name: contactName(r.contact),
      email: r.contact.email,
      accountId: r.contact.accountId,
      addedVia: r.addedVia,
      isPrimary: r.contactId === thread.contactId,
    })),
  });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const mod = await requireCorreosAccess();
  if (!mod.authorized) return mod.response;
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const { threadId } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    contactId?: string;
    force?: boolean;
    addedVia?: string;
  };
  const contactId = body.contactId?.trim();
  if (!contactId) {
    return NextResponse.json({ error: "contactId requerido" }, { status: 400 });
  }

  const thread = await prisma.crmEmailThread.findFirst({
    where: { id: threadId, tenantId: ctx.tenantId },
    select: { id: true, accountId: true, contactId: true },
  });
  if (!thread) return NextResponse.json({ error: "Hilo no encontrado" }, { status: 404 });

  const contact = await prisma.crmContact.findFirst({
    where: { id: contactId, tenantId: ctx.tenantId },
    select: { id: true, accountId: true, firstName: true, lastName: true, email: true },
  });
  if (!contact) return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });

  if (
    thread.accountId &&
    contact.accountId !== thread.accountId &&
    !body.force
  ) {
    return NextResponse.json(
      {
        error: "El contacto no pertenece a la cuenta del hilo",
        code: "OUT_OF_ACCOUNT",
      },
      { status: 409 },
    );
  }

  const addedVia =
    body.addedVia === "ai" || body.addedVia === "backfill" ? body.addedVia : "manual";

  const row = await prisma.crmEmailThreadContact.upsert({
    where: { threadId_contactId: { threadId, contactId } },
    create: {
      tenantId: ctx.tenantId,
      threadId,
      contactId,
      addedVia,
      createdBy: ctx.userId,
    },
    update: {},
    select: { id: true, contactId: true, addedVia: true },
  });

  // Si no hay principal, promover este.
  if (!thread.contactId) {
    await prisma.crmEmailThread.update({
      where: { id: threadId },
      data: { contactId },
    });
  }

  return NextResponse.json({
    success: true,
    contact: {
      id: row.id,
      contactId: row.contactId,
      name: contactName(contact),
      email: contact.email,
      accountId: contact.accountId,
      addedVia: row.addedVia,
      isPrimary: !thread.contactId || thread.contactId === contactId,
    },
  });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const mod = await requireCorreosAccess();
  if (!mod.authorized) return mod.response;
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const { threadId } = await params;
  const contactId = req.nextUrl.searchParams.get("contactId")?.trim();
  if (!contactId) {
    return NextResponse.json({ error: "contactId requerido" }, { status: 400 });
  }

  const thread = await prisma.crmEmailThread.findFirst({
    where: { id: threadId, tenantId: ctx.tenantId },
    select: { id: true, contactId: true },
  });
  if (!thread) return NextResponse.json({ error: "Hilo no encontrado" }, { status: 404 });

  await prisma.crmEmailThreadContact.deleteMany({
    where: { tenantId: ctx.tenantId, threadId, contactId },
  });

  // Nunca dejar el escalar apuntando a un contacto desvinculado.
  if (thread.contactId === contactId) {
    const next = await prisma.crmEmailThreadContact.findFirst({
      where: { tenantId: ctx.tenantId, threadId },
      orderBy: { createdAt: "asc" },
      select: { contactId: true },
    });
    await prisma.crmEmailThread.update({
      where: { id: threadId },
      data: { contactId: next?.contactId ?? null },
    });
  }

  return NextResponse.json({ success: true });
}
