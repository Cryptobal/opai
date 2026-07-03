import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/api-auth";
import { requireSlackAdmin } from "@/lib/integrations/slack/guard";

export const dynamic = "force-dynamic";

const routeSchema = z.object({
  kind: z.literal("route"),
  matchType: z.enum(["KEY", "MODULE"]),
  matchValue: z.string().min(1),
  channelId: z.string().min(1),
  channelName: z.string().min(1),
  enabled: z.boolean().optional(),
});
const defaultSchema = z.object({
  kind: z.literal("default"),
  channelId: z.string().min(1),
  channelName: z.string().min(1),
});
const bodySchema = z.discriminatedUnion("kind", [routeSchema, defaultSchema]);

/** GET → ruteo actual del tenant. */
export async function GET() {
  const auth = await requireSlackAdmin();
  if (auth.error) return auth.error;
  const routes = await prisma.slackChannelRoute.findMany({
    where: { tenantId: auth.ctx.tenantId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ success: true, routes });
}

/** POST → upsert de ruta (kind=route) o set del canal por defecto (kind=default). */
export async function POST(req: NextRequest) {
  const auth = await requireSlackAdmin();
  if (auth.error) return auth.error;
  const { tenantId } = auth.ctx;

  const parsed = await parseBody(req, bodySchema);
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  const ws = await prisma.slackWorkspace.findUnique({ where: { tenantId } });
  if (!ws || ws.status !== "ACTIVE") {
    return NextResponse.json({ success: false, error: "Slack no está conectado" }, { status: 400 });
  }

  if (body.kind === "default") {
    await prisma.slackWorkspace.update({
      where: { tenantId },
      data: { defaultChannelId: body.channelId, defaultChannelName: body.channelName },
    });
    return NextResponse.json({ success: true });
  }

  const route = await prisma.slackChannelRoute.upsert({
    where: {
      tenantId_matchType_matchValue: {
        tenantId,
        matchType: body.matchType,
        matchValue: body.matchValue,
      },
    },
    create: {
      tenantId,
      workspaceId: ws.id,
      matchType: body.matchType,
      matchValue: body.matchValue,
      channelId: body.channelId,
      channelName: body.channelName,
      enabled: body.enabled ?? true,
    },
    update: {
      channelId: body.channelId,
      channelName: body.channelName,
      enabled: body.enabled ?? true,
    },
  });
  return NextResponse.json({ success: true, route });
}

/** DELETE ?id= → elimina una ruta del tenant (scoped por tenantId). */
export async function DELETE(req: NextRequest) {
  const auth = await requireSlackAdmin();
  if (auth.error) return auth.error;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ success: false, error: "Falta id" }, { status: 400 });

  const deleted = await prisma.slackChannelRoute.deleteMany({
    where: { id, tenantId: auth.ctx.tenantId },
  });
  return NextResponse.json({ success: true, deleted: deleted.count });
}
