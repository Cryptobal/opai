import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { getAtsConfig, updateAtsChannelConfigs } from "@/lib/ats/config";
import { requireTenantModule } from '@/lib/require-module';

const channelCfgSchema = z.object({
  enabled: z.boolean(),
  label: z.string(),
  tipo: z.enum(["automatico", "feed", "manual_link", "partner_api"]),
  externalUrl: z.string().optional(),
  feedUrl: z.string().optional(),
  notas: z.string().optional(),
});

const updateChannelsSchema = z.record(z.string(), channelCfgSchema);

export async function GET() {
  try {
    const modCheck = await requireTenantModule('ats');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const config = await getAtsConfig(ctx.tenantId);
    return NextResponse.json({ success: true, data: config.channelConfigs });
  } catch (error) {
    console.error("[ATS] Error getting channel configs:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener configuración de canales" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('ats');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const parsed = await parseBody(request, updateChannelsSchema);
    if (parsed.error) return parsed.error;
    const channels = parsed.data;

    await updateAtsChannelConfigs(ctx.tenantId, channels);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ATS] Error updating channel configs:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar configuración de canales" },
      { status: 500 },
    );
  }
}
