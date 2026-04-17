import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalClienteAuth } from "@/lib/portal-cliente";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  const session = await requirePortalClienteAuth(request);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    currentPin?: string;
    newPin?: string;
  };
  const { currentPin, newPin } = body;

  if (!currentPin || !newPin) {
    return NextResponse.json(
      { error: "PIN actual y nuevo son requeridos" },
      { status: 400 },
    );
  }
  if (!/^\d{4}$/.test(newPin)) {
    return NextResponse.json(
      { error: "El nuevo PIN debe ser 4 dígitos" },
      { status: 400 },
    );
  }

  const contact = await prisma.crmContact.findUnique({
    where: { id: session.contactId },
    select: { portalPin: true },
  });

  if (!contact?.portalPin) {
    return NextResponse.json(
      { error: "No tienes PIN configurado" },
      { status: 400 },
    );
  }

  const valid = await bcrypt.compare(currentPin, contact.portalPin);
  if (!valid) {
    return NextResponse.json({ error: "PIN actual incorrecto" }, { status: 400 });
  }

  const newHashed = await bcrypt.hash(newPin, 10);
  await prisma.crmContact.update({
    where: { id: session.contactId },
    data: { portalPin: newHashed, portalPinVisible: null },
  });

  return NextResponse.json({ success: true });
}
