import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveTenantFromSlug } from "@/lib/tenant";
import { getTenantCompanyConfig } from "@/lib/tenant-config";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  const { tenantSlug } = await params;
  const tenant = await resolveTenantFromSlug(tenantSlug);
  if (!tenant) {
    return new NextResponse("Tenant not found", { status: 404 });
  }

  const cfg = await getTenantCompanyConfig(tenant.id);
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://opai.cl";

  const jobs = await prisma.atsJobPosting.findMany({
    where: { tenantId: tenant.id, estado: "ACTIVO" },
    include: { installation: { select: { name: true, commune: true } } },
    orderBy: { createdAt: "desc" },
  });

  const jobsXml = jobs
    .map((job) => {
      const jobUrl = `${siteUrl}/empleos/${tenantSlug}/${job.jsonLdSlug}?utm_source=feed`;
      const description =
        job.descripcion +
        (job.funciones ? `\n\nFunciones:\n${job.funciones}` : "");

      // Map turno to job type
      const jobType = "Full time";

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
      <company><![CDATA[${cfg.commercialName || cfg.companyName || tenant.name}]]></company>
      <city><![CDATA[${job.commune || job.installation?.commune || ""}]]></city>
      <state><![CDATA[${job.region}]]></state>
      <country><![CDATA[CL]]></country>
      <dateposted><![CDATA[${job.createdAt.toISOString()}]]></dateposted>
      <url><![CDATA[${jobUrl}]]></url>
      <description><![CDATA[${description}]]></description>
      <jobtype><![CDATA[${jobType}]]></jobtype>
      <category><![CDATA[Seguridad Privada]]></category>
      <logo><![CDATA[${cfg.brandingLogoFull || cfg.logoUrl || ""}]]></logo>
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
