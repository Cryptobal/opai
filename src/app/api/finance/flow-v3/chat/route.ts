import { NextRequest, NextResponse } from "next/server";
import { requireFlowV3, flowV3Error } from "@/modules/finance/flow-v3/api-guard";
import { flowChatSchema } from "@/lib/validations/flow-v3";
import { buildFlowChatContext } from "@/modules/finance/flow-v3/chat-context";
import { aiService } from "@/lib/ai-service";
import { AIError } from "@/lib/ai-errors";

const SYSTEM = `Eres el asistente de Flujo de Caja de OPAI. Respondes SOLO con los datos
del contexto de la matriz del tenant que te entregan. Montos en CLP formato es-CL.
No inventes cifras. No ejecutes acciones (no muevas facturas, no edites plan, no cierres semanas).
Si te piden una acción, explica que solo puedes consultar. Si no hay datos, dilo con honestidad.
Respuestas cortas, en español chileno, citando semanas/conceptos del contexto.`;

/** POST { message } — Q&A read-only sobre la matriz del tenant. */
export async function POST(req: NextRequest) {
  const auth = await requireFlowV3("cashflow_view");
  if (auth.error) return auth.error;
  try {
    const body = flowChatSchema.parse(await req.json());
    const context = await buildFlowChatContext(auth.ctx.tenantId);
    const prompt = `${SYSTEM}

--- CONTEXTO MATRIZ ---
${context}
--- FIN CONTEXTO ---

Pregunta del usuario: ${body.message}`;

    const answer = await aiService.generateText(
      prompt,
      { maxTokens: 800, temperature: 0.2 },
      { tenantId: auth.ctx.tenantId, feature: "flow-v3-chat" },
    );
    return NextResponse.json({ success: true, data: { answer } });
  } catch (error) {
    if (error instanceof AIError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 503 },
      );
    }
    console.error("[Finance/FlowV3] POST chat:", error);
    return flowV3Error(error);
  }
}
