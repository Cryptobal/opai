import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireTenantModule } from '@/lib/require-module';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const { id: installationId } = await params;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const visitas = await prisma.opsVisitaTecnica.findMany({
      where: { installationId, tenantId: ctx.tenantId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        account: { select: { id: true, name: true } },
        deal: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const data = visitas.map((v) => ({
      id: v.id,
      status: v.status,
      scheduledAt: v.scheduledAt?.toISOString() ?? null,
      scheduledContact: v.scheduledContact ?? null,
      scheduledPhone: v.scheduledPhone ?? null,
      puestosDetail: v.puestosDetail ?? null,
      quoteId: v.quoteId ?? null,
      checkInAt: v.checkInAt?.toISOString() ?? null,
      checkOutAt: v.checkOutAt?.toISOString() ?? null,
      durationMinutes: v.durationMinutes ?? null,
      generalReport: v.generalReport ?? null,
      securityRisks: v.securityRisks ?? null,
      recommendations: v.recommendations ?? null,
      photos: v.photos ?? null,
      guardsNeeded: v.guardsNeeded ?? null,
      guardShiftType: v.guardShiftType ?? null,
      requiresTransport: v.requiresTransport,
      requiresMeals: v.requiresMeals,
      requiresExams: v.requiresExams,
      requiresEquipment: v.requiresEquipment,
      requiresUniform: v.requiresUniform,
      surveyContactName: v.surveyContactName ?? null,
      surveyContactRole: v.surveyContactRole ?? null,
      surveyVisitOpinion: v.surveyVisitOpinion ?? null,
      createdAt: v.createdAt.toISOString(),
      supervisor: v.user,
      account: v.account,
      deal: v.deal ?? null,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[installations/visitas-tecnicas] Error:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener las visitas técnicas" },
      { status: 500 }
    );
  }
}
