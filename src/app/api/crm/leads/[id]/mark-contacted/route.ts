/**
 * API Route: /api/crm/leads/[id]/mark-contacted
 * POST - Marca el lead como contactado por el canal indicado.
 * El primer contacto setea firstContactAt + firstContactBy. firstContactChannel
 * se actualiza siempre con el último canal usado.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmEdit } from "@/lib/api-auth-crm";
import { requireTenantModule } from "@/lib/require-module";

const schema = z.object({
  channel: z.enum(["whatsapp", "phone", "email", "in_person"]),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule("crm");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx, "leads");
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid channel" },
        { status: 400 }
      );
    }

    const lead = await prisma.crmLead.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!lead) {
      return NextResponse.json(
        { success: false, error: "Lead not found" },
        { status: 404 }
      );
    }

    const updates: {
      firstContactChannel: string;
      firstContactAt?: Date;
      firstContactBy?: string;
    } = {
      firstContactChannel: parsed.data.channel,
    };
    if (!lead.firstContactAt) {
      updates.firstContactAt = new Date();
      updates.firstContactBy = ctx.userId;
    }

    const updated = await prisma.crmLead.update({
      where: { id },
      data: updates,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error marking lead as contacted:", error);
    return NextResponse.json(
      { success: false, error: "Failed to mark lead as contacted" },
      { status: 500 }
    );
  }
}
