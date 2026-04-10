import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveTenantFromSlug } from "@/lib/tenant";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { buildJobXml } from "@/lib/ats/feed-xml";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  const { tenantSlug } = await params;
  const tenant = await resolveTenantFromSlug(tenantSlug);
  if (!tenant) {
    return new NextResponse("Tenant not found", { status: 404 });
  }

  const source = req.nextUrl.searchParams.get("source") || "feed";
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

  const companyName = cfg.commercialName || cfg.companyName || tenant.name;
  const logo = cfg.brandingLogoFull || cfg.logoUrl || "";

  const jobsXml = jobs
    .map((job) =>
      buildJobXml(
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
          tenantSlug,
          companyName,
          logo,
          requiereOS10: job.requiereOS10,
          requiereMovilizacion: job.requiereMovilizacion,
          genero: job.genero,
          vacantes: job.vacantes,
        },
        { siteUrl, source },
      ),
    )
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
