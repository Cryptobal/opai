import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isDtGobClEmail, normalizeDtEmail } from "@/lib/fiscalizacion-dt/domain";
import { hashDtAccessCode, isDtCodeExpired, timingSafeHashEqual } from "@/lib/fiscalizacion-dt/codes";
import { logDtAccess } from "@/lib/fiscalizacion-dt/access-log";
import { getRequestIp, getRequestUserAgent } from "@/lib/fiscalizacion-dt/request-meta";
import { setDtSessionCookie } from "@/lib/fiscalizacion-dt/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ip = getRequestIp(request);
  const userAgent = getRequestUserAgent(request);

  let body: { email?: unknown; clave?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Solicitud inválida" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? normalizeDtEmail(body.email) : "";
  const clave = typeof body.clave === "string" ? body.clave.trim().toUpperCase() : "";

  if (!email || !clave) {
    return NextResponse.json({ success: false, error: "Indique correo y clave" }, { status: 400 });
  }
  if (!isDtGobClEmail(email)) {
    return NextResponse.json(
      { success: false, error: "Solo se aceptan correos institucionales con dominio @dt.gob.cl." },
      { status: 403 },
    );
  }

  const codes = await prisma.dtFiscalizacionAccessCode.findMany({
    where: { email, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const presented = hashDtAccessCode(clave);
  const match = codes.find((c) => timingSafeHashEqual(c.codeHash, presented) && !isDtCodeExpired(c.expiresAt));

  if (!match) {
    await logDtAccess({ email, action: "login_failed", ip, userAgent });
    return NextResponse.json(
      { success: false, error: "Clave inválida o expirada." },
      { status: 401 },
    );
  }

  if (!match.usedAt) {
    await prisma.dtFiscalizacionAccessCode.update({
      where: { id: match.id },
      data: { usedAt: new Date() },
    });
  }

  await setDtSessionCookie({
    email,
    codeId: match.id,
    tenantId: null,
    tenantRut: null,
    expiresAt: match.expiresAt,
  });

  await logDtAccess({ email, action: "login", ip, userAgent });

  return NextResponse.json({ success: true });
}
