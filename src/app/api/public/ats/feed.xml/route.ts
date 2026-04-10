import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { buildJobXml } from "@/lib/ats/feed-xml";

/**
 * Unified XML feed for talent.com (and other feed-based job boards).
 * Aggregates all ACTIVO job postings across all tenants.
 * URL: /api/public/ats/feed.xml?source=talent
 */
export async function GET(req: NextRequest) {
  const source = req.nextUrl.searchParams.get("source") || "feed";
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://opai.cl";

  const jobs = await prisma.atsJobPosting.findMany({
    where: { estado: "ACTIVO" },
    include: {
      tenant: { select: { id: true, slug: true, name: true } },
      installation: { select: { name: true, commune: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Pre-fetch tenant configs for unique tenants
  const tenantIds = [...new Set(jobs.map((j) => j.tenant.id))];
  const cfgMap = new Map<string, Awaited<ReturnType<typeof getTenantCompanyConfig>>>();
  await Promise.all(
    tenantIds.map(async (id) => {
      cfgMap.set(id, await getTenantCompanyConfig(id));
    }),
  );

  const jobsXml = jobs
    .map((job) => {
      const cfg = cfgMap.get(job.tenant.id);
      const companyName = cfg?.commercialName || cfg?.companyName || job.tenant.name;
      const logo = cfg?.brandingLogoFull || cfg?.logoUrl || "";
      return buildJobXml(
        {
          id: job.id,
          titulo: job.titulo,
          descripcion: job.descripcion,
          funciones: job.funciones,
          turno: job.turno,
          region: job.region,
          commune: job.commune,
          installationCommune: job.installation?.commune,
          rentaMin: job.rentaMin,
          rentaMax: job.rentaMax,
          experienciaMinAnios: job.experienciaMinAnios,
          jsonLdSlug: job.jsonLdSlug,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          expiraAt: job.expiraAt,
          tenantSlug: job.tenant.slug,
          companyName,
          logo,
          requiereOS10: job.requiereOS10,
          requiereMovilizacion: job.requiereMovilizacion,
          genero: job.genero,
          vacantes: job.vacantes,
        },
        { siteUrl, source },
      );
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<source>
  <publisher><![CDATA[OPAI]]></publisher>
  <publisherurl><![CDATA[${siteUrl}]]></publisherurl>
  <lastbuilddate><![CDATA[${new Date().toISOString()}]]></lastbuilddate>
${jobsXml}
</source>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "X-Feed-Version": "2.0",
    },
  });
}
