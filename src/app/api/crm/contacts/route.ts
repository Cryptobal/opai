/**
 * API Route: /api/crm/contacts
 * GET  - Listar contactos
 * POST - Crear contacto
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";

export async function GET() {
  try {
    const session = await auth();
    const tenantId = session?.user?.tenantId ?? (await getDefaultTenantId());

    const contacts = await prisma.crmContact.findMany({
      where: { tenantId },
      include: { account: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: contacts });
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
    const session = await auth();
    const tenantId = session?.user?.tenantId ?? (await getDefaultTenantId());
    const body = await request.json();

    if (!body?.accountId) {
      return NextResponse.json(
        { success: false, error: "accountId es requerido" },
        { status: 400 }
      );
    }

    if (!body?.name?.trim()) {
      return NextResponse.json(
        { success: false, error: "Nombre es requerido" },
        { status: 400 }
      );
    }

    const contact = await prisma.crmContact.create({
      data: {
        tenantId,
        accountId: body.accountId,
        name: body.name.trim(),
        email: body?.email?.trim() || null,
        phone: body?.phone?.trim() || null,
        roleTitle: body?.roleTitle?.trim() || null,
        isPrimary: Boolean(body?.isPrimary),
      },
      include: { account: true },
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
