import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  assertInstallationInTenant,
  canManageClientReportConfig,
  requireClientReportAuth,
} from "@/lib/ops/client-report/auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  const gate = await requireClientReportAuth();
  if (!gate.ok) return gate.response;
  const { ctx } = gate.auth;
  const { installationId } = await params;
  const inst = await assertInstallationInTenant(ctx.tenantId, installationId);
  if (!inst) {
    return NextResponse.json(
      { success: false, error: "Instalación no encontrada" },
      { status: 404 }
    );
  }

  const [contacts, recipients] = await Promise.all([
    inst.accountId
      ? prisma.crmContact.findMany({
          where: {
            tenantId: ctx.tenantId,
            accountId: inst.accountId,
            email: { not: null },
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            roleTitle: true,
            isPrimary: true,
            recibeOperacional: true,
          },
          orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }],
        })
      : Promise.resolve([]),
    prisma.opsClientReportRecipient.findMany({
      where: { installationId, isActive: true },
      select: { id: true, contactId: true, email: true, name: true },
    }),
  ]);

  const activeContactIds = new Set(
    recipients.map((r) => r.contactId).filter(Boolean) as string[]
  );
  const extras = recipients.filter((r) => !r.contactId);

  return NextResponse.json({
    success: true,
    data: {
      contacts: contacts.map((c) => ({
        contactId: c.id,
        name: `${c.firstName} ${c.lastName}`.trim(),
        email: c.email!,
        roleTitle: c.roleTitle,
        isPrimary: c.isPrimary,
        recibeOperacional: c.recibeOperacional,
        isRecipient: activeContactIds.has(c.id),
      })),
      extras: extras.map((r) => ({
        id: r.id,
        email: r.email,
        name: r.name,
      })),
    },
  });
}

const Body = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("contact"),
    contactId: z.string().min(1),
    isRecipient: z.boolean(),
  }),
  z.object({
    kind: z.literal("extra"),
    email: z.string().email(),
    name: z.string().optional(),
    isRecipient: z.boolean(),
  }),
]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  const gate = await requireClientReportAuth();
  if (!gate.ok) return gate.response;
  const { ctx, perms } = gate.auth;
  if (!canManageClientReportConfig(perms)) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 }
    );
  }
  const { installationId } = await params;
  const inst = await assertInstallationInTenant(ctx.tenantId, installationId);
  if (!inst) {
    return NextResponse.json(
      { success: false, error: "Instalación no encontrada" },
      { status: 404 }
    );
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Cuerpo inválido" },
      { status: 400 }
    );
  }

  if (parsed.data.kind === "contact") {
    const contact = await prisma.crmContact.findFirst({
      where: { id: parsed.data.contactId, tenantId: ctx.tenantId },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    if (!contact?.email) {
      return NextResponse.json(
        { success: false, error: "Contacto sin email" },
        { status: 404 }
      );
    }
    if (parsed.data.isRecipient) {
      const existing = await prisma.opsClientReportRecipient.findFirst({
        where: { installationId, contactId: contact.id },
      });
      if (existing) {
        await prisma.opsClientReportRecipient.update({
          where: { id: existing.id },
          data: { isActive: true, email: contact.email },
        });
      } else {
        await prisma.opsClientReportRecipient.create({
          data: {
            tenantId: ctx.tenantId,
            installationId,
            contactId: contact.id,
            email: contact.email,
            name: `${contact.firstName} ${contact.lastName}`.trim(),
            isActive: true,
          },
        });
      }
    } else {
      await prisma.opsClientReportRecipient.updateMany({
        where: { installationId, contactId: contact.id },
        data: { isActive: false },
      });
    }
    return NextResponse.json({ success: true });
  }

  const email = parsed.data.email.trim().toLowerCase();
  if (parsed.data.isRecipient) {
    const existing = await prisma.opsClientReportRecipient.findFirst({
      where: { installationId, email, contactId: null },
    });
    if (existing) {
      await prisma.opsClientReportRecipient.update({
        where: { id: existing.id },
        data: { isActive: true, name: parsed.data.name ?? existing.name },
      });
    } else {
      await prisma.opsClientReportRecipient.create({
        data: {
          tenantId: ctx.tenantId,
          installationId,
          email,
          name: parsed.data.name ?? null,
          isActive: true,
        },
      });
    }
  } else {
    await prisma.opsClientReportRecipient.updateMany({
      where: { installationId, email, contactId: null },
      data: { isActive: false },
    });
  }
  return NextResponse.json({ success: true });
}
