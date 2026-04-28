import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { decryptApiKey } from "@/lib/ai-encryption";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const { id } = await params;

  const provider = await prisma.tenantAiProvider.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  if (!provider?.apiKey) {
    return NextResponse.json(
      { success: false, error: "No configurada" },
      { status: 404 },
    );
  }
  return NextResponse.json({ success: true, apiKey: decryptApiKey(provider.apiKey) });
}
