/**
 * API Route: /api/cpq/quotes/[id]/clone
 * POST - Clonar cotización CPQ
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqEdit } from "@/lib/api-auth-cpq";
import { prisma } from "@/lib/prisma";
import { requireTenantModule } from '@/lib/require-module';
import { cloneCpqQuote } from "@/modules/cpq/clone-quote.service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const modCheck = await requireTenantModule('cpq');
    if (!modCheck.authorized) return modCheck.response;

    const { id } = await params;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqEdit(ctx);
    if (forbidden) return forbidden;
    const tenantId = ctx.tenantId;

    const json = await request.json().catch(() => ({}));
    const optionalName =
      typeof json?.name === "string" && json.name.trim() ? json.name.trim() : undefined;

    try {
      const cloned = await cloneCpqQuote({
        tenantId,
        sourceQuoteId: id,
        overrideName: optionalName,
        createdBy: ctx.userId,
      });
      const full = await prisma.cpqQuote.findFirst({
        where: { id: cloned.id, tenantId },
      });

      return NextResponse.json({ success: true, data: full ?? cloned }, { status: 201 });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "QUOTE_NOT_FOUND") {
        return NextResponse.json(
          { success: false, error: "Quote not found" },
          { status: 404 },
        );
      }
      if (msg === "QUOTE_CODE_UNAVAILABLE") {
        return NextResponse.json(
          { success: false, error: "Could not generate unique quote code" },
          { status: 500 },
        );
      }
      throw e;
    }
  } catch (error) {
    console.error("Error cloning CPQ quote:", error);
    return NextResponse.json(
      { success: false, error: "Failed to clone quote" },
      { status: 500 },
    );
  }
}
