import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAuth, platformUnauthorized } from "@/lib/platform-api-auth";

const PAGE_SIZE = 50;

function truncateArgs(args: unknown): string {
  try {
    const s = JSON.stringify(args);
    return s.length > 500 ? `${s.slice(0, 500)}…` : s;
  } catch {
    return String(args).slice(0, 500);
  }
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requirePlatformAuth();
    if (!ctx) return platformUnauthorized();

    const url = new URL(request.url);
    const tenantId = url.searchParams.get("tenantId") || undefined;
    const toolName = url.searchParams.get("toolName") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);

    const where: Record<string, unknown> = {};
    if (tenantId) where.tenantId = tenantId;
    if (toolName) where.toolName = toolName;
    if (status) where.status = status;
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const [rows, total] = await Promise.all([
      prisma.aiActionLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          tenant: { select: { id: true, name: true, slug: true } },
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.aiActionLog.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        rows: rows.map((r) => ({
          id: r.id,
          createdAt: r.createdAt.toISOString(),
          tenantId: r.tenantId,
          tenantName: r.tenant.name,
          tenantSlug: r.tenant.slug,
          userId: r.userId,
          userName: r.user.name ?? r.user.email,
          toolName: r.toolName,
          status: r.status,
          durationMs: r.durationMs,
          resultEntityId: r.resultEntityId,
          resultEntityType: r.resultEntityType,
          errorMessage: r.errorMessage,
          args: truncateArgs(r.args),
        })),
        total,
        page,
        pageSize: PAGE_SIZE,
      },
    });
  } catch (err) {
    console.error("[platform/ai-actions] GET error:", err);
    return NextResponse.json(
      { success: false, error: "Error al obtener acciones del agente" },
      { status: 500 },
    );
  }
}
