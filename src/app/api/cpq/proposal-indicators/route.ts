import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqEdit, requireCpqView } from "@/lib/api-auth-cpq";
import {
  getProposalIndicators,
  saveProposalIndicators,
} from "@/lib/cpq/fixed-sections";
import { requireTenantModule } from "@/lib/require-module";

const indicatorSchema = z.object({
  id: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1, "La etiqueta es obligatoria").max(120),
  value: z.string().max(200),
  metricKey: z.string().trim().max(64).optional().nullable(),
  visible: z.boolean(),
});

const indicatorsSchema = z.array(indicatorSchema).max(24);
const payloadSchema = z
  .union([
    indicatorsSchema,
    z.object({ proposalIndicators: indicatorsSchema }),
    z.object({ indicators: indicatorsSchema }),
  ])
  .transform((value) => {
    if (Array.isArray(value)) return value;
    if ("proposalIndicators" in value) return value.proposalIndicators;
    return value.indicators;
  });

export async function GET() {
  try {
    const modCheck = await requireTenantModule("cpq");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqView(ctx);
    if (forbidden) return forbidden;

    const proposalIndicators = await getProposalIndicators(ctx.tenantId);
    return NextResponse.json({
      success: true,
      data: proposalIndicators,
      proposalIndicators,
    });
  } catch (error) {
    console.error("Error fetching CPQ proposal indicators:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron cargar los indicadores" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule("cpq");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqEdit(ctx);
    if (forbidden) return forbidden;

    const parsed = payloadSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.issues[0]?.message ?? "Indicadores inválidos",
        },
        { status: 400 },
      );
    }

    const proposalIndicators = await saveProposalIndicators(
      ctx.tenantId,
      parsed.data,
    );
    return NextResponse.json({
      success: true,
      data: proposalIndicators,
      proposalIndicators,
    });
  } catch (error) {
    console.error("Error saving CPQ proposal indicators:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron guardar los indicadores" },
      { status: 500 },
    );
  }
}
