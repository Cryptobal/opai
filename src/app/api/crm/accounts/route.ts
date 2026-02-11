/**
 * API Route: /api/crm/accounts
 * GET  - Listar clientes
 * POST - Crear cliente
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { createAccountSchema } from "@/lib/validations/crm";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const type = request.nextUrl.searchParams.get("type") || undefined;

    const accounts = await prisma.crmAccount.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(type ? { type } : {}),
      },
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
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const parsed = await parseBody(request, createAccountSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const account = await prisma.crmAccount.create({
      data: {
        tenantId: ctx.tenantId,
        name: body.name,
        rut: body.rut || null,
        legalName: body.legalName || null,
        legalRepresentativeName: body.legalRepresentativeName || null,
        legalRepresentativeRut: body.legalRepresentativeRut || null,
        industry: body.industry || null,
        segment: body.segment || null,
        ownerId: ctx.userId,
        type: body.type,
        status: body.status,
        website: body.website || null,
        address: body.address || null,
        notes: body.notes || null,
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
