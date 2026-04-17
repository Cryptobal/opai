import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalClienteAuth } from "@/lib/portal-cliente";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ versionId: string }> },
) {
  const session = await requirePortalClienteAuth(request);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { versionId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    firmanteNombre?: string;
    firmanteRut?: string;
  };

  const version = await prisma.protocolVersion.findUnique({
    where: { id: versionId },
    include: {
      installation: { select: { id: true, accountId: true, tenantId: true } },
    },
  });

  if (!version || !version.installation) {
    return NextResponse.json({ error: "Protocolo no encontrado" }, { status: 404 });
  }

  if (
    version.installation.tenantId !== session.tenantId ||
    version.installation.accountId !== session.accountId ||
    !session.installationIds.includes(version.installationId)
  ) {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  if (version.status !== "published") {
    return NextResponse.json(
      { error: "Este protocolo no está vigente para firma" },
      { status: 400 },
    );
  }

  const firmanteNombre =
    (body.firmanteNombre?.trim() ||
      `${session.firstName} ${session.lastName}`.trim()) ||
    "Sin nombre";
  const firmanteEmail = session.email || "no-email@opai.cl";

  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const userAgent = request.headers.get("user-agent") || null;

  const acceptance = await prisma.protocolAcceptance.create({
    data: {
      tenantId: session.tenantId,
      accountId: session.accountId,
      installationId: version.installationId,
      contactId: session.contactId,
      protocolVersionId: version.id,
      versionNumber: version.versionNumber,
      snapshot: version.snapshot as object,
      firmanteNombre,
      firmanteRut: body.firmanteRut?.trim() || null,
      firmanteEmail,
      ipAddress,
      userAgent,
    },
  });

  return NextResponse.json({
    success: true,
    data: {
      acceptanceId: acceptance.id,
      acceptedAt: acceptance.acceptedAt.toISOString(),
    },
  });
}
