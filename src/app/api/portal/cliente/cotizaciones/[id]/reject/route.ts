import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ClienteSession } from "@/lib/portal-cliente";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const raw = cookieStore.get("portal_cliente_session")?.value;
  if (!raw) return NextResponse.json({ error: "No session" }, { status: 401 });

  let session: ClienteSession;
  try {
    session = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const { id } = await params;

  // Verify ownership
  const quote = await prisma.cpqQuote.findFirst({
    where: { id, accountId: session.accountId, tenantId: session.tenantId },
    select: { id: true },
  });

  if (!quote) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let reason: string | undefined;
  try {
    const body = await request.json();
    reason = body.reason;
  } catch {
    // No body or invalid JSON — reason is optional
  }

  await prisma.cpqQuote.update({
    where: { id },
    data: {
      status: "rejected",
      ...(reason ? { notes: reason } : {}),
    },
  });

  return NextResponse.json({ success: true });
}
