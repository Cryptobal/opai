import { NextRequest, NextResponse } from "next/server";
import { IncidenteError, publicErrorResponse } from "@/lib/incidentes-instalacion/errors";
import { getPublicFollowTimeline } from "@/lib/incidentes-instalacion/timeline";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ followToken: string }> },
) {
  try {
    const { followToken } = await params;
    const data = await getPublicFollowTimeline(followToken);
    return NextResponse.json({ success: true, data });
  } catch (err) {
    if (err instanceof IncidenteError) {
      return NextResponse.json(publicErrorResponse(err), { status: err.httpStatus });
    }
    console.error("[public/reporte/seguimiento]", err);
    return NextResponse.json(
      { success: false, error: "No se pudo cargar el seguimiento", code: "NOT_FOUND" },
      { status: 500 },
    );
  }
}
