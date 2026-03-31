import { NextRequest, NextResponse } from "next/server";
import { verificarTokenExterno } from "@/lib/alertas-cobertura/token.service";

/**
 * GET /alerta/t/[token]
 *
 * Redirect route for Twilio WhatsApp button CTA.
 * Twilio only allows one variable at the end of the URL, so we decode
 * the JWT token to extract the alertaId and redirect to the full page.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const decoded = await verificarTokenExterno(token);
  if (!decoded) {
    return NextResponse.redirect(
      new URL("/alerta/invalid", _request.url),
    );
  }

  return NextResponse.redirect(
    new URL(`/alerta/${decoded.alertaId}?token=${token}`, _request.url),
  );
}
