/**
 * API Route: /api/crm/contacts
 * GET  - Listar contactos
 * POST - Crear contacto
 * PATCH - Editar contacto
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { requireCrmView, requireCrmEdit } from "@/lib/api-auth-crm";
import { createContactSchema, updateContactSchema } from "@/lib/validations/crm";
import { computeChangedFields, createCrmHistoryLog } from "@/lib/crm-history";
import { requireTenantModule } from '@/lib/require-module';
import { cleanRut, toSiiRut, formatRut } from "@/lib/chile-rut";
import {
  listCrmContacts,
  type ContactListFilter,
  type ContactListSort,
} from "@/lib/crm/list-contacts";

export async function GET(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmView(ctx, "contacts");
    if (forbidden) return forbidden;

    const sp = request.nextUrl.searchParams;
    const accountIdParam = sp.get("accountId") || undefined;
    const rutParam = sp.get("rut") || undefined;
    const portalEnabled = sp.get("portalEnabled");
    const search = sp.get("search") || undefined;
    const filterRaw = sp.get("filter");
    const filter = (
      filterRaw === "active" || filterRaw === "all" || filterRaw === "with_account" || filterRaw === "without_account"
        ? filterRaw
        : undefined
    ) as ContactListFilter | undefined;
    const sortRaw = sp.get("sort");
    const sort = (
      sortRaw === "az" || sortRaw === "za" || sortRaw === "newest" || sortRaw === "oldest"
        ? sortRaw
        : undefined
    ) as ContactListSort | undefined;
    const includeCounts = sp.get("includeCounts") === "true";
    const limitRaw = sp.get("limit") ?? sp.get("pageSize");
    const pageRaw = sp.get("page");
    const paginated = limitRaw != null || pageRaw != null;

    // Si viene RUT y no accountId, resolvemos la cuenta CRM por RUT.
    let accountId = accountIdParam;
    if (!accountId && rutParam && cleanRut(rutParam).length >= 2) {
      const variants = Array.from(
        new Set([rutParam, toSiiRut(rutParam), formatRut(rutParam)]),
      );
      const account = await prisma.crmAccount.findFirst({
        where: { tenantId: ctx.tenantId, rut: { in: variants } },
        select: { id: true },
      });
      accountId = account?.id;
    }

    // GUARD CRÍTICO: si el caller pidió por cuenta o RUT pero no se resolvió
    // a una cuenta, devolvemos VACÍO — NUNCA todos los contactos del tenant.
    const scopedByParam = !!accountIdParam || !!rutParam;
    if (scopedByParam && !accountId) {
      return NextResponse.json({ success: true, data: [] });
    }

    const result = await listCrmContacts({
      tenantId: ctx.tenantId,
      accountId,
      portalEnabled: portalEnabled === "true" ? true : undefined,
      search,
      filter,
      sort,
      includeCounts: includeCounts || paginated,
      ...(paginated
        ? {
            page: pageRaw != null ? Number.parseInt(pageRaw, 10) : 1,
            pageSize: limitRaw != null ? Number.parseInt(limitRaw, 10) : undefined,
          }
        : {}),
    });

    if (!paginated) {
      return NextResponse.json({ success: true, data: result.contacts });
    }

    return NextResponse.json({
      success: true,
      data: result.contacts,
      meta: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        hasMore: result.hasMore,
        counts: result.counts,
      },
    });
  } catch (error) {
    console.error("Error fetching CRM contacts:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch contacts" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx, "contacts");
    if (forbidden) return forbidden;

    const parsed = await parseBody(request, createContactSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    // Un contacto puede pertenecer a varias cuentas CRM (gerente que
    // trabaja para varias empresas-cliente). La unicidad solo aplica
    // dentro de la MISMA cuenta para evitar duplicados accidentales.
    // No hay constraint UNIQUE en el modelo Prisma, asi que relajar es seguro.
    const emailNormalized = body.email.trim().toLowerCase();
    const existingInSameAccount = await prisma.crmContact.findFirst({
      where: {
        tenantId: ctx.tenantId,
        accountId: body.accountId,
        email: { equals: emailNormalized, mode: "insensitive" },
      },
      include: { account: true },
    });
    if (existingInSameAccount) {
      // Idempotencia: ya existe en esta cuenta → devolverlo sin error.
      return NextResponse.json({ success: true, data: existingInSameAccount }, { status: 200 });
    }

    // Un solo contacto principal por cuenta: si marcamos este como principal, quitar principal a los demás
    if (body.isPrimary) {
      await prisma.crmContact.updateMany({
        where: { tenantId: ctx.tenantId, accountId: body.accountId },
        data: { isPrimary: false },
      });
    }

    const contact = await prisma.crmContact.create({
      data: {
        tenantId: ctx.tenantId,
        accountId: body.accountId,
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email || null,
        phone: body.phone || null,
        roleTitle: body.roleTitle || null,
        isPrimary: body.isPrimary ?? false,
        recibeCesion: body.recibeCesion ?? false,
      },
      include: { account: true },
    });
    await createCrmHistoryLog({
      tenantId: ctx.tenantId,
      entityType: "contact",
      entityId: contact.id,
      action: "contact_created",
      details: {
        fullName: `${contact.firstName} ${contact.lastName}`.trim(),
        email: contact.email,
        accountId: contact.accountId,
      },
      createdBy: ctx.userId,
    });

    return NextResponse.json({ success: true, data: contact }, { status: 201 });
  } catch (error) {
    console.error("Error creating CRM contact:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create contact" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx, "contacts");
    if (forbidden) return forbidden;

    const { id, ...body } = await request.json();
    if (!id) {
      return NextResponse.json(
        { success: false, error: "ID es requerido" },
        { status: 400 }
      );
    }

    const parsed = updateContactSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Datos inválidos" },
        { status: 400 }
      );
    }

    const existing = await prisma.crmContact.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Contacto no encontrado" },
        { status: 404 }
      );
    }

    // Un solo contacto principal por cuenta: si marcamos este como principal, quitar principal a los demás de la misma cuenta
    if (parsed.data.isPrimary === true && !existing.isPrimary) {
      await prisma.crmContact.updateMany({
        where: { tenantId: ctx.tenantId, accountId: existing.accountId },
        data: { isPrimary: false },
      });
    }

    const contact = await prisma.crmContact.update({
      where: { id },
      data: parsed.data,
      include: { account: true },
    });
    const diff = computeChangedFields(
      existing as unknown as Record<string, unknown>,
      parsed.data as unknown as Record<string, unknown>
    );
    await createCrmHistoryLog({
      tenantId: ctx.tenantId,
      entityType: "contact",
      entityId: id,
      action: "contact_updated",
      details: {
        changedFields: diff.changedFields,
        changes: diff.changes,
      },
      createdBy: ctx.userId,
    });

    return NextResponse.json({ success: true, data: contact });
  } catch (error) {
    console.error("Error updating CRM contact:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update contact" },
      { status: 500 }
    );
  }
}
