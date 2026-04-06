import { NextResponse } from "next/server";

export async function PUT() {
  return NextResponse.json(
    {
      success: false,
      error: "La configuración de proveedores de IA se gestiona ahora a nivel de plataforma.",
    },
    { status: 410 },
  );
}
