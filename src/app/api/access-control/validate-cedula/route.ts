import { NextRequest, NextResponse } from "next/server";

/**
 * Validates the validity of a Chilean cédula de identidad.
 *
 * NOTE: Full online validation against Registro Civil requires either:
 * - Scraping the portal (which has CAPTCHA protections)
 * - Using a formal API (e.g., Certificadora del Sur)
 *
 * For now, this endpoint logs the attempt and returns the QR data as verified.
 * The actual online validation is a feature flag (require_id_validation).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { run, serial, mrz } = body as {
      run: string;
      serial: string;
      mrz?: string;
    };

    if (!run || !serial) {
      return NextResponse.json(
        { success: false, error: "RUN y serial son requeridos" },
        { status: 400 }
      );
    }

    // For now, mark as "not_checked" unless we implement the actual validation
    // The QR data is stored in the access record for audit purposes
    return NextResponse.json({
      success: true,
      data: {
        valid: true,
        status: "not_checked",
        message: "Datos del QR registrados. Validación online no disponible.",
        qrData: {
          run,
          serial,
          hasMrz: !!mrz,
        },
      },
    });
  } catch (error) {
    console.error("[AccessControl] Error validating cedula:", error);
    return NextResponse.json(
      { success: false, error: "Error al validar cédula" },
      { status: 500 }
    );
  }
}
