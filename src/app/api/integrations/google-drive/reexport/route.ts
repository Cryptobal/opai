import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reexportTenantDriveFromR2 } from "@/lib/google-workspace/drive-reexport";

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

export async function POST(request: NextRequest) {
  const session = await auth();
  const gate = requireAdmin(session);
  if ("error" in gate && gate.error) return gate.error;
  const tenantId = gate.tenantId!;

  const ws = await prisma.googleDriveWorkspace.findUnique({ where: { tenantId } });
  if (!ws || ws.status !== "ACTIVE") {
    return NextResponse.json({ error: "Drive no conectado" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    confirm?: boolean;
    cursor?: string | null;
  };
  if (body.confirm !== true) {
    return NextResponse.json(
      { error: "Se requiere confirmación explícita (confirm: true)" },
      { status: 400 },
    );
  }

  const result = await reexportTenantDriveFromR2(tenantId, body.cursor ?? null);
  return NextResponse.json({ ok: true, ...result });
}
