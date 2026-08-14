import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  DEFAULT_MIRROR_CONFIG,
  SUPPORTED_DOC_TYPES,
  type SupportedDocType,
} from "@/lib/google-workspace/drive-mirror-config";
import { backfillDocType } from "@/lib/google-workspace/drive-reexport";

function requireAdmin(
  session: { user?: { tenantId?: string | null; role?: string | null } | null } | null,
) {
  if (!session?.user?.tenantId) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!["owner", "admin"].includes(session.user.role ?? "")) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { tenantId: session.user.tenantId as string };
}

function isSupported(v: unknown): v is SupportedDocType {
  return typeof v === "string" && (SUPPORTED_DOC_TYPES as readonly string[]).includes(v);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  const gate = requireAdmin(session);
  if ("error" in gate && gate.error) return gate.error;
  const tenantId = gate.tenantId!;

  const rl = checkRateLimit(`drive-backfill:${tenantId}`, {
    limit: 10,
    windowSeconds: 60,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Demasiados backfills; esperá un minuto e intentá de nuevo" },
      { status: 429 },
    );
  }

  const ws = await prisma.googleDriveWorkspace.findUnique({ where: { tenantId } });
  if (!ws || ws.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "Drive no está activo. Conectá o activá la unidad primero." },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { docType?: unknown };
  if (!isSupported(body.docType)) {
    return NextResponse.json(
      {
        error: `docType inválido. Usa uno de: ${SUPPORTED_DOC_TYPES.join(", ")}`,
      },
      { status: 400 },
    );
  }
  const docType = body.docType;

  const mirrorConfig = {
    ...DEFAULT_MIRROR_CONFIG,
    ...(ws.mirrorConfig && typeof ws.mirrorConfig === "object"
      ? (ws.mirrorConfig as Record<string, boolean>)
      : {}),
  };
  if (mirrorConfig[docType] !== true) {
    return NextResponse.json(
      {
        error: `El tipo «${docType}» está apagado. Activalo en «Qué se espeja» y volvé a intentar.`,
      },
      { status: 400 },
    );
  }

  const result = await backfillDocType(tenantId, docType);
  return NextResponse.json({ ok: true, docType, ...result });
}
