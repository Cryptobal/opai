import { NextRequest, NextResponse } from "next/server";
import { validateClienteSession } from "@/lib/portal-cliente";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rut, pin } = body as { rut?: string; pin?: string };

    if (!rut || !pin) {
      return NextResponse.json({ success: false, error: "RUT y PIN son requeridos" }, { status: 401 });
    }

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? undefined;
    const result = await validateClienteSession(rut, pin, ip);

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 401 });
    }

    return NextResponse.json({ success: true, data: result.session });
  } catch (error) {
    console.error("[Portal Cliente] Auth error:", error);
    return NextResponse.json({ success: false, error: "Error al autenticar" }, { status: 500 });
  }
}
