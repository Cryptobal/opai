/**
 * POST /api/crm/apollo/enrich
 *
 * Enriquece un contacto/lead usando Apollo People Enrichment.
 * Acepta email, nombre, dominio o LinkedIn — devuelve datos de persona + empresa.
 * Consume 1 crédito Apollo por match exitoso.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { requireCrmEdit } from "@/lib/api-auth-crm";
import { enrichPerson } from "@/lib/apollo-client";
import { requireTenantModule } from '@/lib/require-module';

const enrichSchema = z
  .object({
    email: z.string().email().optional(),
    first_name: z.string().max(100).optional(),
    last_name: z.string().max(100).optional(),
    name: z.string().max(200).optional(),
    domain: z.string().max(200).optional(),
    organization_name: z.string().max(200).optional(),
    linkedin_url: z.string().url().optional(),
  })
  .refine(
    (d) =>
      d.email || d.linkedin_url || d.domain || d.organization_name || d.name,
    { message: "Debes proveer al menos email, LinkedIn, dominio o nombre" }
  );

export async function POST(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx, "leads");
    if (forbidden) return forbidden;

    const parsed = await parseBody(request, enrichSchema);
    if (parsed.error) return parsed.error;

    const result = await enrichPerson(parsed.data);

    if (!result.person) {
      return NextResponse.json({
        success: true,
        data: null,
        message: "No se encontró un match en Apollo para los datos provistos",
      });
    }

    const { person, organization } = result;

    return NextResponse.json({
      success: true,
      data: {
        person: {
          apolloId: person.id,
          firstName: person.first_name,
          lastName: person.last_name,
          name: person.name,
          email: person.email,
          emailStatus: person.email_status,
          title: person.title,
          headline: person.headline,
          linkedinUrl: person.linkedin_url,
          photoUrl: person.photo_url,
          twitterUrl: person.twitter_url,
          city: person.city,
          state: person.state,
          country: person.country,
          seniority: person.seniority,
          departments: person.departments,
          isLikelyToEngage: person.is_likely_to_engage,
          employmentHistory: person.employment_history?.map((e) => ({
            company: e.organization_name,
            title: e.title,
            current: e.current,
            startDate: e.start_date,
            endDate: e.end_date,
          })),
        },
        organization: organization
          ? {
              apolloId: organization.id,
              name: organization.name,
              website: organization.website_url,
              linkedinUrl: organization.linkedin_url,
              industry: organization.industry,
              employees: organization.estimated_num_employees,
              annualRevenue: organization.annual_revenue_printed,
              totalFunding: organization.total_funding_printed,
              fundingStage: organization.latest_funding_stage,
              foundedYear: organization.founded_year,
              city: organization.city,
              country: organization.country,
              description: organization.short_description,
              logoUrl: organization.logo_url,
              technologies: organization.technologies,
              keywords: organization.keywords,
            }
          : null,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error desconocido";
    console.error("[apollo/enrich]", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
