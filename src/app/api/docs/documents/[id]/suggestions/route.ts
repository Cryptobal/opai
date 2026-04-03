import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

/**
 * GET — List suggestions for a document (admin)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const document = await prisma.document.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });

    if (!document) {
      return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });
    }

    const suggestions = await prisma.contractSuggestion.findMany({
      where: { documentId: id, tenantId: ctx.tenantId },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ success: true, data: suggestions });
  } catch (error) {
    console.error("Error fetching suggestions:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
