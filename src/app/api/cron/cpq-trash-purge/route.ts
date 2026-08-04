/**
 * Cron: purga de la papelera de cotizaciones CPQ.
 * Elimina definitivamente los registros expirados (>30 días) y sus adjuntos R2.
 */

import { NextRequest, NextResponse } from "next/server";
import { purgeExpiredTrash } from "@/modules/cpq/quote-trash.service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await purgeExpiredTrash();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron/cpq-trash-purge]", error);
    return NextResponse.json(
      { ok: false, error: "Error al purgar la papelera" },
      { status: 500 },
    );
  }
}
