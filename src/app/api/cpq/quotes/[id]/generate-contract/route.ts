/**
 * API Route: /api/cpq/quotes/[id]/generate-contract
 * POST — Generate a service contract document from a CPQ quote
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqEdit } from "@/lib/api-auth-cpq";
import { generateServiceContract } from "@/lib/docs/generate-service-contract";
import { requireTenantModule } from '@/lib/require-module';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule('cpq');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqEdit(ctx);
    if (forbidden) return forbidden;

    const { id: quoteId } = await params;

    const result = await generateServiceContract(quoteId, ctx.tenantId, ctx.userId);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { documentId: result.documentId },
    });
  } catch (error) {
    console.error("Error generating service contract:", error);
    return NextResponse.json(
      { success: false, error: "Error al generar contrato" },
      { status: 500 }
    );
  }
}
