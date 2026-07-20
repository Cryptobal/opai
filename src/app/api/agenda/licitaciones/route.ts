import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listLicitacionesEnCarpeta } from "@/modules/agenda/agenda.service";

export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const items = await listLicitacionesEnCarpeta(session.user.tenantId);
  return NextResponse.json({ items });
}
