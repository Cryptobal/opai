/**
 * API Route: /api/chat/channels/cleanup-inactive
 * POST — Delete EXTERNAL chat channels with messageCount = 0 AND lastMessageAt IS NULL.
 * Body: { scope: 'prospects' | 'clients' | 'all_external' }
 * Does NOT delete the underlying CrmAccount or contacts. Owner/admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canDelete } from "@/lib/permissions";
import { requireTenantModule } from "@/lib/require-module";

const Body = z.object({
  scope: z.enum(["prospects", "clients", "all_external"]),
});

export async function POST(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule("chat");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const perms = await resolveApiPerms(ctx);
    if (!canDelete(perms, "hub")) {
      return NextResponse.json(
        { success: false, error: "Solo administradores pueden limpiar canales" },
        { status: 403 }
      );
    }

    const json = await request.json().catch(() => ({}));
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Body inválido" },
        { status: 400 }
      );
    }

    const { scope } = parsed.data;

    let accountIdFilter: string[] | null = null;
    if (scope === "prospects" || scope === "clients") {
      const statuses =
        scope === "prospects"
          ? ["prospect"]
          : ["client_active", "client_inactive"];
      const matchingAccounts = await prisma.crmAccount.findMany({
        where: { tenantId: ctx.tenantId, status: { in: statuses } },
        select: { id: true },
      });
      accountIdFilter = matchingAccounts.map((a) => a.id);
      if (accountIdFilter.length === 0) {
        return NextResponse.json({ success: true, data: { deleted: 0 } });
      }
    }

    const candidates = await prisma.chatChannel.findMany({
      where: {
        tenantId: ctx.tenantId,
        channelType: "EXTERNAL",
        messageCount: 0,
        lastMessageAt: null,
        ...(accountIdFilter ? { accountId: { in: accountIdFilter } } : {}),
      },
      select: { id: true },
    });

    if (candidates.length === 0) {
      return NextResponse.json({ success: true, data: { deleted: 0 } });
    }

    const result = await prisma.chatChannel.deleteMany({
      where: {
        id: { in: candidates.map((c) => c.id) },
        tenantId: ctx.tenantId,
        channelType: "EXTERNAL",
        messageCount: 0,
        lastMessageAt: null,
      },
    });

    return NextResponse.json({
      success: true,
      data: { deleted: result.count },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/chat/channels/cleanup-inactive] Error:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
