import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const session = parsePortalClienteSessionCookie(
      cookieStore.get("portal_cliente_session")?.value
    );
    if (!session?.contactId) {
      return NextResponse.json({ success: false }, { status: 401 });
    }

    const presentation = await prisma.crmCompanyPresentation.findFirst({
      where: {
        contactId: session.contactId,
        status: { in: ["sent", "viewed"] },
      },
    });

    if (!presentation) {
      return NextResponse.json({ success: false, error: "No presentation" }, { status: 404 });
    }

    await prisma.crmCompanyPresentation.update({
      where: { id: presentation.id },
      data: {
        status: "viewed",
        viewCount: { increment: 1 },
        firstViewedAt: presentation.firstViewedAt ?? new Date(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Portal] Error tracking presentation view:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
