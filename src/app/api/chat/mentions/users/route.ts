/**
 * API Route: /api/chat/mentions/users
 * GET — List admin users for @mention autocomplete.
 *        For GROUP channels: only group members.
 *        For INSTALLATION channels: all tenant admins.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const sp = request.nextUrl.searchParams;
    const search = sp.get("search")?.trim() || "";
    const channelId = sp.get("channelId") || "";

    let adminIds: string[] | null = null;

    // If channelId provided and it's a GROUP channel, filter by group members
    if (channelId) {
      const channel = await prisma.chatChannel.findFirst({
        where: { id: channelId, tenantId: ctx.tenantId },
        select: { channelType: true, groupId: true },
      });

      if (channel?.channelType === "GROUP" && channel.groupId) {
        const members = await prisma.adminGroupMembership.findMany({
          where: { groupId: channel.groupId },
          select: { adminId: true },
        });
        adminIds = members.map((m) => m.adminId);
      }
    }

    const where: any = {
      tenantId: ctx.tenantId,
      status: "active",
    };

    if (adminIds) {
      where.id = { in: adminIds };
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    const admins = await prisma.admin.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
      },
      orderBy: { name: "asc" },
      take: 20,
    });

    return NextResponse.json({
      success: true,
      data: admins,
    });
  } catch (err: any) {
    console.error("Error listing mention users:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
