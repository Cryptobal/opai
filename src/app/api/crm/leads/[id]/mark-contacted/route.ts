/**
 * API Route: /api/crm/leads/[id]/mark-contacted
 * POST - Marca el lead como contactado por un canal específico.
 *        firstContactAt/firstContactBy se setean solo en el primer contacto;
 *        firstContactChannel se actualiza siempre (último canal usado).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { requireCrmEdit } from "@/lib/api-auth-crm";
import { requireTenantModule } from "@/lib/require-module";

const markContactedSchema = z.object({
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

    const lead = await prisma.crmLead.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!lead) {
      return NextResponse.json(
        { success: false, error: "Prospecto no encontrado" },
        { status: 404 }
      );
    }

    const parsed = await parseBody(request, markContactedSchema);
    if (parsed.error) return parsed.error;

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
      { success: false, error: "Failed to mark as contacted" },
      { status: 500 }
    );
  }
}
