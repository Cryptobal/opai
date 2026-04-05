import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantCompanyConfig } from "@/lib/tenant-config";

/**
 * Unified XML feed for talent.com (and other feed-based job boards).
 * Aggregates all ACTIVO job postings across all tenants.
 * URL: /api/public/ats/feed.xml
 */
export async function GET() {
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
      const jobUrl = `${siteUrl}/empleos/${job.tenant.slug}/${job.jsonLdSlug}?utm_source=talent`;
      const description =
        job.descripcion +
        (job.funciones ? `\n\nFunciones:\n${job.funciones}` : "");
      const logo = cfg?.brandingLogoFull || cfg?.logoUrl || "";

      let salaryXml = "";
      if (job.rentaMin) {
        salaryXml = `
      <salary>
        <min><![CDATA[${job.rentaMin}]]></min>
        <max><![CDATA[${job.rentaMax || job.rentaMin}]]></max>
        <currency><![CDATA[CLP]]></currency>
        <period><![CDATA[Monthly]]></period>
        <type><![CDATA[gross]]></type>
      </salary>`;
      }

      return `
    <job>
      <referencenumber><![CDATA[${job.id}]]></referencenumber>
      <title><![CDATA[${job.titulo}]]></title>
      <company><![CDATA[${companyName}]]></company>
      <city><![CDATA[${job.commune || job.installation?.commune || ""}]]></city>
      <state><![CDATA[${job.region}]]></state>
      <country><![CDATA[CL]]></country>
      <dateposted><![CDATA[${job.createdAt.toISOString()}]]></dateposted>
      <url><![CDATA[${jobUrl}]]></url>
      <description><![CDATA[${description}]]></description>
      <jobtype><![CDATA[Full time]]></jobtype>
      <category><![CDATA[Seguridad Privada]]></category>
      <logo><![CDATA[${logo}]]></logo>
      ${job.expiraAt ? `<expirationdate><![CDATA[${job.expiraAt.toISOString()}]]></expirationdate>` : ""}
      ${salaryXml}
    </job>`;
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
    },
  });
}
