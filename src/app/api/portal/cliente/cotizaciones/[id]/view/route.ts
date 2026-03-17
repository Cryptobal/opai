import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const session = parsePortalClienteSessionCookie(
    cookieStore.get("portal_cliente_session")?.value
  );
  if (!session?.contactId) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  const { id: quoteId } = await params;

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null;
  const userAgent = request.headers.get("user-agent") ?? null;

  try {
    await prisma.portalAccessLog.create({
      data: {
        tenantId: session.tenantId,
        portalType: "cliente",
        userType: "contact",
        userId: session.contactId,
        accountId: session.accountId,
        action: "view_quote",
        resource: quoteId,
        ip,
        userAgent,
      },
    });
  } catch (e) {
    console.warn("[Portal] view_quote log failed:", (e as Error)?.message);
  }

  return NextResponse.json({ success: true });
}
