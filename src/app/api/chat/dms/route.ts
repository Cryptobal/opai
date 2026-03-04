/**
 * API Route: /api/chat/dms
 * POST — Create or get existing DM channel between two admins.
 *        Body: { targetAdminId: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const body = await request.json().catch(() => ({}));
    const targetAdminId = typeof body.targetAdminId === "string" ? body.targetAdminId.trim() : "";

    if (!targetAdminId) {
      return NextResponse.json(
        { success: false, error: "targetAdminId es requerido" },
        { status: 400 }
      );
    }

    if (targetAdminId === ctx.userId) {
      return NextResponse.json(
        { success: false, error: "No puedes crear un DM contigo mismo" },
        { status: 400 }
      );
    }

    // Verify target admin exists and belongs to same tenant
    const targetAdmin = await prisma.admin.findFirst({
      where: { id: targetAdminId, tenantId: ctx.tenantId, status: "active" },
      select: { id: true, name: true, email: true },
    });

    if (!targetAdmin) {
      return NextResponse.json(
        { success: false, error: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    // Check if DM channel already exists between these two admins
    const existingChannel = await prisma.chatChannel.findFirst({
      where: {
        tenantId: ctx.tenantId,
        channelType: "DIRECT",
        dmParticipants: {
          every: {
            adminId: { in: [ctx.userId, targetAdminId] },
          },
        },
        AND: [
          { dmParticipants: { some: { adminId: ctx.userId } } },
          { dmParticipants: { some: { adminId: targetAdminId } } },
        ],
      },
      include: {
        dmParticipants: true,
      },
    });

    if (existingChannel) {
      return NextResponse.json({
        success: true,
        data: {
          id: existingChannel.id,
          channelType: "DIRECT",
          name: targetAdmin.name,
          targetAdmin: {
            id: targetAdmin.id,
            name: targetAdmin.name,
            email: targetAdmin.email,
            image: null,
          },
          lastMessageAt: existingChannel.lastMessageAt?.toISOString() ?? null,
          lastMessagePreview: existingChannel.lastMessagePreview,
          isNew: false,
        },
      });
    }

    // Get current admin info for channel name
    const currentAdmin = await prisma.admin.findFirst({
      where: { id: ctx.userId },
      select: { name: true },
    });

    // Create new DM channel with both participants
    const newChannel = await prisma.chatChannel.create({
      data: {
        tenantId: ctx.tenantId,
        channelType: "DIRECT",
        name: `${currentAdmin?.name ?? "Admin"} & ${targetAdmin.name}`,
        isActive: true,
        dmParticipants: {
          create: [
            { adminId: ctx.userId },
            { adminId: targetAdminId },
          ],
        },
      },
      include: {
        dmParticipants: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: newChannel.id,
        channelType: "DIRECT",
        name: targetAdmin.name,
        targetAdmin: {
          id: targetAdmin.id,
          name: targetAdmin.name,
          email: targetAdmin.email,
          image: null,
        },
        lastMessageAt: null,
        lastMessagePreview: null,
        isNew: true,
      },
    });
  } catch (err: any) {
    console.error("Error creating DM channel:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
