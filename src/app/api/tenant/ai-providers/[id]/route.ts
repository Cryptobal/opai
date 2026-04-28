import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { encryptApiKey } from "@/lib/ai-encryption";

async function ensureOwned(tenantId: string, id: string) {
  return prisma.tenantAiProvider.findFirst({ where: { id, tenantId } });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const { id } = await params;

  const owned = await ensureOwned(ctx.tenantId, id);
  if (!owned) {
    return NextResponse.json({ success: false, error: "No encontrado" }, { status: 404 });
  }

  const body = await request.json();
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name;
  if (typeof body.baseUrl !== "undefined") data.baseUrl = body.baseUrl || null;
  if (typeof body.apiKey === "string" && body.apiKey) data.apiKey = encryptApiKey(body.apiKey);
  if (typeof body.isActive === "boolean") data.isActive = body.isActive;

  if (data.isActive === true) {
    await prisma.tenantAiProvider.updateMany({
      where: { tenantId: ctx.tenantId, NOT: { id } },
      data: { isActive: false },
    });
  }

  await prisma.tenantAiProvider.update({ where: { id }, data });
  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const { id } = await params;

  const owned = await ensureOwned(ctx.tenantId, id);
  if (!owned) {
    return NextResponse.json({ success: false, error: "No encontrado" }, { status: 404 });
  }

  await prisma.tenantAiProvider.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
