/**
 * API Route: /api/crm/accounts
 * GET  - Listar clientes
 * POST - Crear cliente
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";

export async function GET() {
  try {
    const session = await auth();
    const tenantId = session?.user?.tenantId ?? (await getDefaultTenantId());

    const accounts = await prisma.crmAccount.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: accounts });
  } catch (error) {
    console.error("Error fetching CRM accounts:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch accounts" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const tenantId = session?.user?.tenantId ?? (await getDefaultTenantId());
    const body = await request.json();

    if (!body?.name?.trim()) {
      return NextResponse.json(
        { success: false, error: "Nombre es requerido" },
        { status: 400 }
      );
    }

    const account = await prisma.crmAccount.create({
      data: {
        tenantId,
        name: body.name.trim(),
        rut: body?.rut?.trim() || null,
        industry: body?.industry?.trim() || null,
        size: body?.size?.trim() || null,
        segment: body?.segment?.trim() || null,
        ownerId: session?.user?.id || null,
        status: body?.status?.trim() || "active",
        website: body?.website?.trim() || null,
        address: body?.address?.trim() || null,
        notes: body?.notes?.trim() || null,
      },
    });

    return NextResponse.json({ success: true, data: account }, { status: 201 });
  } catch (error) {
    console.error("Error creating CRM account:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create account" },
      { status: 500 }
    );
  }
}
