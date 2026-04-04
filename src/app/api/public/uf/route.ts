import { NextResponse } from "next/server";
import { getUfValue } from "@/lib/uf";

export const dynamic = "force-dynamic";

export async function GET() {
  const value = await getUfValue();
  return NextResponse.json(
    { uf: value, date: new Date().toISOString().split("T")[0] },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
