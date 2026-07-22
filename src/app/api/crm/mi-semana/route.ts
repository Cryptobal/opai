/** GET → agenda comercial del usuario (tareas + compromisos con fecha). */
import { NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireTenantModule } from "@/lib/require-module";
import { getMiSemana } from "@/modules/crm/mi-semana";

export const dynamic = "force-dynamic";

export async function GET() {
  const mod = await requireTenantModule("crm");
  if (!mod.authorized) return mod.response;
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  return NextResponse.json({ items: await getMiSemana(ctx.tenantId, ctx.userId) });
}
