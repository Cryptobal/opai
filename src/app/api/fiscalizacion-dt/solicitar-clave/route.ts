import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isDtGobClEmail, normalizeDtEmail } from "@/lib/fiscalizacion-dt/domain";
import {
  dtCodeExpiresAt,
  generateDtAccessCode,
  hashDtAccessCode,
} from "@/lib/fiscalizacion-dt/codes";
import { sendAccessCodeEmail } from "@/lib/fiscalizacion-dt/emails";
import { logDtAccess } from "@/lib/fiscalizacion-dt/access-log";
import { getRequestIp, getRequestUserAgent } from "@/lib/fiscalizacion-dt/request-meta";
import {
  checkRateLimit,
  getClientIp,
  getDtClaveEmailRateLimit,
  getDtClaveIpRateLimit,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

async function allowRate(key: string, limit: number, limiter: ReturnType<typeof getDtClaveEmailRateLimit>) {
  if (limiter) {
    const r = await limiter.limit(key);
    return r.success;
  }
  return checkRateLimit(key, { limit, windowSeconds: 3600 }).allowed;
}

export async function POST(request: Request) {
  const ip = getRequestIp(request);
  const userAgent = getRequestUserAgent(request);

  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Solicitud inválida" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? normalizeDtEmail(body.email) : "";
  if (!email) {
    return NextResponse.json({ success: false, error: "Indique el correo institucional" }, { status: 400 });
  }

  if (!isDtGobClEmail(email)) {
    await logDtAccess({
      email,
      action: "request_code_rejected",
      ip,
      userAgent,
      meta: { reason: "domain" },
    });
    return NextResponse.json(
      {
        success: false,
        error: "Solo se aceptan correos institucionales con dominio @dt.gob.cl.",
      },
      { status: 403 },
    );
  }

  const emailOk = await allowRate(`dt-clave:email:${email}`, 10, getDtClaveEmailRateLimit());
  const ipOk = await allowRate(`dt-clave:ip:${getClientIp(request)}`, 30, getDtClaveIpRateLimit());
  if (!emailOk || !ipOk) {
    return NextResponse.json(
      { success: false, error: "Límite de solicitudes alcanzado. Intente más tarde." },
      { status: 429 },
    );
  }

  const code = generateDtAccessCode();
  const expiresAt = dtCodeExpiresAt();
  await prisma.dtFiscalizacionAccessCode.create({
    data: {
      email,
      codeHash: hashDtAccessCode(code),
      expiresAt,
      requestIp: ip,
    },
  });

  await sendAccessCodeEmail(email, code, expiresAt);
  await logDtAccess({ email, action: "request_code", ip, userAgent });

  return NextResponse.json({
    success: true,
    message: "Clave enviada al correo institucional. Vigencia: 5 días corridos.",
    expiresAt: expiresAt.toISOString(),
  });
}
