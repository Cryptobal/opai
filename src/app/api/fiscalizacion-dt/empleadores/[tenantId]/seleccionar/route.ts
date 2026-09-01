import { NextRequest, NextResponse } from "next/server";
import { requireDtSession, setDtSessionCookie } from "@/lib/fiscalizacion-dt/session";
import { getDtEmpleador, resolveDtNoticeEmail } from "@/lib/fiscalizacion-dt/empleadores";
import { sendArt24bNotice } from "@/lib/fiscalizacion-dt/emails";
import { logDtAccess } from "@/lib/fiscalizacion-dt/access-log";
import { getRequestIp, getRequestUserAgent } from "@/lib/fiscalizacion-dt/request-meta";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const session = await requireDtSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Sesión expirada" }, { status: 401 });
  }

  const { tenantId } = await params;
  const employer = await getDtEmpleador(tenantId);
  if (!employer) {
    return NextResponse.json({ success: false, error: "Empleador no encontrado" }, { status: 404 });
  }

  const noticeEmail = await resolveDtNoticeEmail(tenantId);
  let noticeSent = false;
  if (noticeEmail) {
    const sent = await sendArt24bNotice(noticeEmail);
    noticeSent = sent.ok;
  }

  await setDtSessionCookie({
    ...session,
    tenantId: employer.id,
    tenantRut: employer.companyRut || null,
  });

  await logDtAccess({
    email: session.email,
    action: "select_employer",
    tenantId: employer.id,
    tenantRut: employer.companyRut,
    ip: getRequestIp(request),
    userAgent: getRequestUserAgent(request),
    meta: {
      noticeSent,
      noticeMissing: !noticeEmail,
    },
  });

  return NextResponse.json({
    success: true,
    tenantId: employer.id,
    legalName: employer.legalName || employer.name,
    rut: employer.companyRut || "",
  });
}
