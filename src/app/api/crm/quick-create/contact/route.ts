/**
 * POST /api/crm/quick-create/contact
 * Creación rápida de contacto. Si no se envía accountId, crea una cuenta automáticamente.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmEdit } from "@/lib/api-auth-crm";
import { z } from "zod";
import { requireTenantModule } from '@/lib/require-module';

const quickCreateContactSchema = z.object({
  firstName: z.string().trim().min(1, "Nombre es requerido").max(100),
  lastName: z.string().trim().min(1, "Apellido es requerido").max(100),
  email: z
    .string()
    .trim()
    .max(200)
    .optional()
    .nullable()
    .transform((v) => (v === "" || !v ? null : v))
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Email inválido"),
  phone: z.string().trim().max(30).optional().nullable().or(z.literal("")),
  roleTitle: z.string().trim().max(100).optional().nullable().or(z.literal("")),
  accountId: z.string().uuid().optional().nullable(),
});

export async function POST(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx, "contacts");
    if (forbidden) return forbidden;

    const parsed = quickCreateContactSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Datos inválidos" },
        { status: 400 }
      );
    }
    const body = parsed.data;

    let accountId = body.accountId ?? null;

    if (!accountId) {
      const accountName = `Contacto: ${body.firstName} ${body.lastName}`;
      const newAccount = await prisma.crmAccount.create({
        data: {
          tenantId: ctx.tenantId,
          name: accountName,
          ownerId: ctx.userId,
          type: "prospect",
          status: "prospect",
          isActive: false,
        },
      });
      accountId = newAccount.id;
    }

    const emailNormalized = body.email?.trim().toLowerCase();
    if (emailNormalized) {
      const existing = await prisma.crmContact.findFirst({
        where: {
          tenantId: ctx.tenantId,
          email: { equals: emailNormalized, mode: "insensitive" },
        },
      });
      if (existing) {
        return NextResponse.json(
          {
            success: false,
            error: "Ya existe un contacto con este email. Use el mismo para evitar duplicados.",
          },
          { status: 409 }
        );
      }
    }

    const contact = await prisma.crmContact.create({
      data: {
        tenantId: ctx.tenantId,
        accountId,
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email || null,
        phone: body.phone || null,
        roleTitle: body.roleTitle || null,
        isPrimary: false,
      },
      include: { account: true },
    });

    return NextResponse.json({ success: true, data: contact }, { status: 201 });
  } catch (error) {
    console.error("[CRM] Error quick-create contact:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo crear el contacto" },
      { status: 500 }
    );
  }
}
