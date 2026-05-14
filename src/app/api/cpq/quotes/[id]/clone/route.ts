/**
 * API Route: /api/cpq/quotes/[id]/clone
 * POST - Clonar cotización CPQ
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
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
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    const tenantId = session.user.tenantId;

    const json = await request.json().catch(() => ({}));
    const optionalName =
      typeof json?.name === "string" && json.name.trim() ? json.name.trim() : undefined;

    try {
      const cloned = await cloneCpqQuote({
        tenantId,
        sourceQuoteId: id,
        overrideName: optionalName,
        createdBy: session.user?.id ?? null,
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
