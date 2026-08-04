import { NextRequest, NextResponse } from "next/server";
import { requireFlowV3, flowV3Error } from "@/modules/finance/flow-v3/api-guard";
import { linkDteToTemplate } from "@/modules/finance/flow-v3/link-template.service";
import { flowUnmatchedIncomeLinkTemplateSchema } from "@/lib/validations/flow-v3";

/**
 * POST { dteId, templateId } — vincula un DTE a una programación de la misma
 * cuenta (setea recurringTemplateId + billingPeriod). Requiere cashflow_manage.
 */
export async function POST(req: NextRequest) {
  const auth = await requireFlowV3("cashflow_manage");
  if (auth.error) return auth.error;
  try {
    const body = flowUnmatchedIncomeLinkTemplateSchema.parse(await req.json());
    const data = await linkDteToTemplate(auth.ctx.tenantId, body.dteId, body.templateId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Finance/FlowV3] POST unmatched-income/link-template:", error);
    return flowV3Error(error);
  }
}
