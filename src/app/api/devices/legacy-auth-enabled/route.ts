import { NextResponse } from "next/server";

export async function GET() {
  const enabled = process.env.LEGACY_RONDAS_AUTH_ENABLED === "true";
  return NextResponse.json({ enabled });
}
