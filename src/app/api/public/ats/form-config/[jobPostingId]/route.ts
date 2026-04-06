import { NextRequest, NextResponse } from "next/server";
import { getPublicFormConfig } from "@/lib/ats/public-form-config";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobPostingId: string }> },
) {
  const { jobPostingId } = await params;
  const config = await getPublicFormConfig(jobPostingId);
  if (!config) {
    return NextResponse.json(
      { success: false, error: "Oferta no disponible" },
      { status: 404 },
    );
  }
  return NextResponse.json({ success: true, data: config });
}
