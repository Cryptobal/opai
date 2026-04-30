/**
 * API Route: /api/crm/leads
 * GET  - Listar prospectos
 * POST - Crear prospecto
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { requireCrmView, requireCrmEdit } from "@/lib/api-auth-crm";
import { createLeadSchema } from "@/lib/validations/crm";
import { toSentenceCase } from "@/lib/text-format";
import { requireTenantModule } from '@/lib/require-module';

export async function GET(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmView(ctx, "leads");
    if (forbidden) return forbidden;

    const status = request.nextUrl.searchParams.get("status") || undefined;

    const leads = await prisma.crmLead.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: leads });
  } catch (error) {
    console.error("Error fetching CRM leads:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch leads" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx, "leads");
    if (forbidden) return forbidden;

    const parsed = await parseBody(request, createLeadSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;
    const firstName = toSentenceCase(body.firstName) ?? null;
    const lastName = toSentenceCase(body.lastName) ?? null;

    const lead = await prisma.crmLead.create({
      data: {
        tenantId: ctx.tenantId,
        status: "pending",
        source: body.source || null,
        firstName,
        lastName,
        email: body.email || null,
        phone: body.phone || null,
        companyName: body.companyName || null,
        notes: body.notes || null,
        industry: body.industry || null,
        address: body.address || null,
        commune: body.commune || null,
        city: body.city || null,
        website: body.website || null,
        serviceType: body.serviceType || null,
        metadata: body.metadata || null,
      },
    });

    // New CRM lead — notify admins (bell + push, email per user pref)
    try {
      const { notify } = await import('@/lib/notifications/notify');
      await notify({
        tenantId: ctx.tenantId,
        type: 'new_lead',
        title: 'Nuevo lead registrado',
        body: `${lead.firstName} ${lead.lastName}${lead.companyName ? ` — ${lead.companyName}` : ''}`,
        link: '/opai/crm/leads',
      });
    } catch (err) {
      console.error('[CRM] Error notifying new_lead:', err);
    }

    // Apollo auto-enrich (background, non-blocking)
    if (process.env.APOLLO_API_KEY) {
      const enrichEmail = lead.email?.trim();
      const enrichDomain = lead.website?.trim()?.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      if (enrichEmail || enrichDomain || lead.firstName) {
        import("@/lib/apollo-client").then(async ({ enrichPerson }) => {
          try {
            const result = await enrichPerson({
              ...(enrichEmail ? { email: enrichEmail } : {}),
              ...(enrichDomain ? { domain: enrichDomain } : {}),
              ...(lead.firstName ? { first_name: lead.firstName } : {}),
              ...(lead.lastName ? { last_name: lead.lastName } : {}),
              ...(lead.companyName ? { organization_name: lead.companyName } : {}),
            });
            if (result.person || result.organization) {
              const p = result.person;
              const o = result.organization;
              const apolloEnrichment = {
                person: p ? { title: p.title, seniority: p.seniority, linkedinUrl: p.linkedin_url, headline: p.headline, photoUrl: p.photo_url, city: p.city, country: p.country, departments: p.departments, isLikelyToEngage: p.is_likely_to_engage } : undefined,
                organization: o ? { name: o.name, industry: o.industry, employees: o.estimated_num_employees, annualRevenue: o.annual_revenue_printed, website: o.website_url, description: o.short_description, logoUrl: o.logo_url, keywords: o.keywords, technologies: o.technologies } : undefined,
              };
              const existingMeta = (lead.metadata && typeof lead.metadata === "object" && !Array.isArray(lead.metadata)) ? lead.metadata as Record<string, unknown> : {};
              await prisma.crmLead.update({
                where: { id: lead.id },
                data: { metadata: { ...existingMeta, apolloEnrichment } },
              });
              // Auto-fill missing fields from Apollo
              const updates: Record<string, string> = {};
              if (!lead.industry && o?.industry) updates.industry = o.industry;
              if (!lead.website && o?.website_url) updates.website = o.website_url;
              if (Object.keys(updates).length > 0) {
                await prisma.crmLead.update({ where: { id: lead.id }, data: updates });
              }
            }
          } catch (err) {
            console.error("[CRM] Apollo auto-enrich failed:", err);
          }
        }).catch(() => {});
      }
    }

    return NextResponse.json({ success: true, data: lead }, { status: 201 });
  } catch (error) {
    console.error("Error creating CRM lead:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create lead" },
      { status: 500 }
    );
  }
}
