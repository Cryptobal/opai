import { NextResponse } from "next/server";

/**
 * 500 JSON para rutas de reporte cliente. Nunca devolver body vacío:
 * el front parsea `error` + `detail` para mostrar el fallo sin spinner eterno.
 */
export function clientReportError(error: unknown, message: string): NextResponse {
  console.error("[OPS][CLIENT-REPORT]", error);
  const detail = error instanceof Error ? error.message : String(error);
  return NextResponse.json(
    { success: false, error: message, detail },
    { status: 500 }
  );
}
