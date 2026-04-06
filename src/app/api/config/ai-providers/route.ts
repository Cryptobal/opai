import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      success: false,
      error: "La configuración de proveedores de IA se gestiona ahora a nivel de plataforma. Contacta al administrador de OPAI.",
    },
    { status: 410 },
  );
}
