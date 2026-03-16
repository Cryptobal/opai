/**
 * API Route: /api/portal/cliente/presentation
 *
 * GET  - Check if there's an active company presentation for the logged-in contact
 * POST - Track a view of the presentation
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

function getSession() {
  try {
    const cookieStore = cookies();
    const raw = (cookieStore as any).get("portal_cliente_session")?.value;
    if (!raw) return null;
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf-8"));
  } catch {
    return null;
  }
}

export async function GET() {
  const session = getSession();
  if (!session?.contactId) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  const presentation = await prisma.crmCompanyPresentation.findFirst({
    where: {
      contactId: session.contactId,
      tenantId: session.tenantId,
      status: { in: ["sent", "viewed"] },
    },
    orderBy: { sentAt: "desc" },
  });

  return NextResponse.json({
    success: true,
    presentation: presentation || null,
  });
}

export async function POST(request: NextRequest) {
  const session = getSession();
  if (!session?.contactId) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  const presentation = await prisma.crmCompanyPresentation.findFirst({
    where: {
      contactId: session.contactId,
      tenantId: session.tenantId,
      status: { in: ["sent", "viewed"] },
    },
    orderBy: { sentAt: "desc" },
  });

  if (!presentation) {
    return NextResponse.json({ success: false, error: "No presentation found" }, { status: 404 });
  }

  await prisma.crmCompanyPresentation.update({
    where: { id: presentation.id },
    data: {
      firstViewedAt: presentation.firstViewedAt || new Date(),
      viewCount: { increment: 1 },
      status: "viewed",
    },
  });

  return NextResponse.json({ success: true });
}
