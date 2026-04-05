import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { getAtsSnippets, updateAtsSnippets } from "@/lib/ats/snippets";

const snippetSchema = z.object({
  id: z.string(),
  label: z.string().max(100),
  text: z.string().max(2000),
});

const updateSnippetsSchema = z.object({
  titulo: z.array(snippetSchema),
  descripcion: z.array(snippetSchema),
  funciones: z.array(snippetSchema),
});

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const snippets = await getAtsSnippets(ctx.tenantId);
    return NextResponse.json({ success: true, data: snippets });
  } catch (error) {
    console.error("[ATS] Error getting snippets:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener fragmentos" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const parsed = await parseBody(request, updateSnippetsSchema);
    if (parsed.error) return parsed.error;

    await updateAtsSnippets(ctx.tenantId, parsed.data);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ATS] Error updating snippets:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar fragmentos" },
      { status: 500 },
    );
  }
}
