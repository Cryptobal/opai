/**
 * API Route: /api/crm/deals/[id]/contacts
 * GET    - Listar contactos vinculados al deal
 * POST   - Vincular contacto al deal
 * DELETE - Desvincular contacto del deal
 * PATCH  - Cambiar rol (marcar como primary)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmView, requireCrmEdit, requireCrmDelete } from "@/lib/api-auth-crm";
import { requireTenantModule } from '@/lib/require-module';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmView(ctx, "deals");
    if (forbidden) return forbidden;

    const { id: dealId } = await params;

    const dealContacts = await prisma.crmDealContact.findMany({
      where: { dealId, tenantId: ctx.tenantId },
      include: {
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            roleTitle: true,
            isPrimary: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ success: true, data: dealContacts });
  } catch (error) {
    console.error("Error fetching deal contacts:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch deal contacts" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id: dealId } = await params;
    const body = await request.json();
    const { contactId, role = "participant" } = body;

    if (!contactId) {
      return NextResponse.json(
        { success: false, error: "contactId es requerido" },
        { status: 400 }
      );
    }

    // If marking as primary, demote the current primary
    if (role === "primary") {
      await prisma.crmDealContact.updateMany({
        where: { dealId, tenantId: ctx.tenantId, role: "primary" },
        data: { role: "participant" },
      });

      // Update the deal's primaryContactId
      await prisma.crmDeal.update({
        where: { id: dealId },
        data: { primaryContactId: contactId },
      });

      // Propagate to linked quotes
      const linked = await prisma.crmDealQuote.findMany({
        where: { dealId, tenantId: ctx.tenantId },
        select: { quoteId: true },
      });
      if (linked.length > 0) {
        await prisma.cpqQuote.updateMany({
          where: {
            id: { in: linked.map((q) => q.quoteId) },
            tenantId: ctx.tenantId,
          },
          data: { contactId },
        });
      }
    }

    const dealContact = await prisma.crmDealContact.create({
      data: {
        tenantId: ctx.tenantId,
        dealId,
        contactId,
        role,
      },
      include: {
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            roleTitle: true,
            isPrimary: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, data: dealContact }, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return NextResponse.json(
        { success: false, error: "Este contacto ya está vinculado al negocio" },
        { status: 409 }
      );
    }
    console.error("Error adding deal contact:", error);
    return NextResponse.json(
      { success: false, error: "Failed to add deal contact" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmDelete(ctx, "deals");
    if (forbidden) return forbidden;

    const { id: dealId } = await params;
    const { searchParams } = new URL(request.url);
    const contactId = searchParams.get("contactId");

    if (!contactId) {
      return NextResponse.json(
        { success: false, error: "contactId es requerido" },
        { status: 400 }
      );
    }

    await prisma.crmDealContact.deleteMany({
      where: { dealId, contactId, tenantId: ctx.tenantId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing deal contact:", error);
    return NextResponse.json(
      { success: false, error: "Failed to remove deal contact" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx, "deals");
    if (forbidden) return forbidden;

    const { id: dealId } = await params;
    const body = await request.json();
    const { contactId, role } = body;

    if (!contactId || !role) {
      return NextResponse.json(
        { success: false, error: "contactId y role son requeridos" },
        { status: 400 }
      );
    }

    // If setting as primary, demote others
    if (role === "primary") {
      await prisma.crmDealContact.updateMany({
        where: { dealId, tenantId: ctx.tenantId, role: "primary" },
        data: { role: "participant" },
      });

      await prisma.crmDeal.update({
        where: { id: dealId },
        data: { primaryContactId: contactId },
      });

      // Propagate to linked quotes
      const linked = await prisma.crmDealQuote.findMany({
        where: { dealId, tenantId: ctx.tenantId },
        select: { quoteId: true },
      });
      if (linked.length > 0) {
        await prisma.cpqQuote.updateMany({
          where: {
            id: { in: linked.map((q) => q.quoteId) },
            tenantId: ctx.tenantId,
          },
          data: { contactId },
        });
      }
    }

    const existing = await prisma.crmDealContact.findFirst({
      where: { dealId, contactId, tenantId: ctx.tenantId },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Contacto no vinculado a este negocio" },
        { status: 404 }
      );
    }

    const updated = await prisma.crmDealContact.update({
      where: { id: existing.id },
      data: { role },
      include: {
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            roleTitle: true,
            isPrimary: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error updating deal contact:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update deal contact" },
      { status: 500 }
    );
  }
}
