/**
 * API Route: /api/crm/leads
 * GET  - Listar prospectos
 * POST - Crear prospecto
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const tenantId = session?.user?.tenantId ?? (await getDefaultTenantId());
    const status = request.nextUrl.searchParams.get("status") || undefined;

    const leads = await prisma.crmLead.findMany({
      where: {
        tenantId,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: leads });
  } catch (error) {
    console.error("Error fetching CRM leads:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch leads" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const tenantId = session?.user?.tenantId ?? (await getDefaultTenantId());
    const body = await request.json();

    const lead = await prisma.crmLead.create({
      data: {
        tenantId,
        status: "pending",
        source: body?.source?.trim() || null,
        name: body?.name?.trim() || null,
        email: body?.email?.trim() || null,
        phone: body?.phone?.trim() || null,
        companyName: body?.companyName?.trim() || null,
        notes: body?.notes?.trim() || null,
      },
    });

    return NextResponse.json({ success: true, data: lead }, { status: 201 });
  } catch (error) {
    console.error("Error creating CRM lead:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create lead" },
      { status: 500 }
    );
  }
}
