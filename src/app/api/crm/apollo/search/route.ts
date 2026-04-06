/**
 * POST /api/crm/apollo/search
 *
 * Busca personas en la base de 220M+ contactos de Apollo.
 * NO CONSUME CRÉDITOS — ideal para prospección.
 * No devuelve emails ni teléfonos (usar enrich para eso).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { requireCrmView } from "@/lib/api-auth-crm";
import { searchPeople } from "@/lib/apollo-client";
import { requireTenantModule } from '@/lib/require-module';

const searchSchema = z.object({
  person_titles: z.array(z.string()).optional(),
  person_seniorities: z.array(z.string()).optional(),
  person_locations: z.array(z.string()).optional(),
  q_keywords: z.string().max(500).optional(),
  organization_domains: z.array(z.string()).optional(),
  organization_locations: z.array(z.string()).optional(),
  organization_num_employees_ranges: z.array(z.string()).optional(),
  per_page: z.number().min(1).max(100).optional().default(25),
  page: z.number().min(1).max(500).optional().default(1),
});

export async function POST(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmView(ctx, "leads");
    if (forbidden) return forbidden;

    const parsed = await parseBody(request, searchSchema);
    if (parsed.error) return parsed.error;

    const result = await searchPeople(parsed.data);

    return NextResponse.json({
      success: true,
      data: {
        people: (result.people || []).map((p) => ({
          apolloId: p.id,
          firstName: p.first_name,
          lastName: p.last_name,
          name: p.name,
          title: p.title,
          headline: p.headline,
          linkedinUrl: p.linkedin_url,
          photoUrl: p.photo_url,
          city: p.city,
          country: p.country,
          seniority: p.seniority,
          departments: p.departments,
          isLikelyToEngage: p.is_likely_to_engage,
          organization: p.organization
            ? {
                name: p.organization.name,
                website: p.organization.website_url,
                industry: p.organization.industry,
                employees: p.organization.estimated_num_employees,
                logoUrl: p.organization.logo_url,
              }
            : null,
        })),
        pagination: result.pagination,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error desconocido";
    console.error("[apollo/search]", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
