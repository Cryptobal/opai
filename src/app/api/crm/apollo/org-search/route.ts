/**
 * POST /api/crm/apollo/org-search
 *
 * Busca empresas en Apollo — ideal para encontrar empresas por
 * industria, tamaño, ubicación y keywords (ej: "guardias de seguridad").
 * Consume créditos.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { requireCrmView } from "@/lib/api-auth-crm";
import { searchOrganizations } from "@/lib/apollo-client";

const orgSearchSchema = z.object({
  q_organization_keyword_tags: z.array(z.string()).optional(),
  q_organization_name: z.string().max(200).optional(),
  organization_locations: z.array(z.string()).optional(),
  organization_num_employees_ranges: z.array(z.string()).optional(),
  per_page: z.number().min(1).max(100).optional().default(25),
  page: z.number().min(1).max(500).optional().default(1),
});

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmView(ctx, "leads");
    if (forbidden) return forbidden;

    const parsed = await parseBody(request, orgSearchSchema);
    if (parsed.error) return parsed.error;

    let result;
    try {
      result = await searchOrganizations(parsed.data);
    } catch (apolloErr) {
      console.error("[apollo/org-search] Apollo call failed:", apolloErr);
      const detail = apolloErr instanceof Error ? apolloErr.message : "Apollo API call failed";
      return NextResponse.json({ success: false, error: detail }, { status: 502 });
    }
    return NextResponse.json({
      success: true,
      data: {
        organizations: (result.organizations || []).map((o) => ({
          apolloId: o.id,
          name: o.name,
          website: o.website_url,
          linkedinUrl: o.linkedin_url,
          industry: o.industry,
          employees: o.estimated_num_employees,
          annualRevenue: o.annual_revenue_printed,
          totalFunding: o.total_funding_printed,
          fundingStage: o.latest_funding_stage,
          foundedYear: o.founded_year,
          city: o.city,
          state: o.state,
          country: o.country,
          description: o.short_description,
          logoUrl: o.logo_url,
          keywords: o.keywords,
          phone: o.phone,
        })),
        pagination: result.pagination,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error desconocido";
    console.error("[apollo/org-search]", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
