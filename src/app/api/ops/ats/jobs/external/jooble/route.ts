import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { searchExternalJobs } from "@/lib/ats/jooble.service";
import { requireTenantModule } from '@/lib/require-module';

const searchSchema = z.object({
  q: z.string().min(1, "Keyword requerido").max(200),
  location: z.string().max(200).optional().default(""),
  page: z.coerce.number().int().min(1).max(100).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export async function GET(request: NextRequest) {
  const modCheck = await requireTenantModule('ats');
  if (!modCheck.authorized) return modCheck.response;

  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const forbidden = await ensureOpsAccess(ctx);
  if (forbidden) return forbidden;

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = searchSchema.safeParse(params);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return NextResponse.json(
      { success: false, error: issues },
      { status: 400 },
    );
  }

  const { q, location, page, limit } = parsed.data;

  try {
    const result = await searchExternalJobs({
      keywords: q,
      location: location || undefined,
      page,
      ResultOnPage: limit,
    });

    return NextResponse.json({
      success: true,
      data: result.jobs,
      pagination: {
        page,
        limit,
        totalCount: result.totalCount,
      },
    });
  } catch (err) {
    console.error("[API] Jooble search error", err);
    const message =
      err instanceof Error ? err.message : "Error buscando en Jooble";
    return NextResponse.json(
      { success: false, error: message },
      { status: 502 },
    );
  }
}
