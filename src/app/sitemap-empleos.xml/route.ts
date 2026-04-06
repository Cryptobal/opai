import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Sitemap dedicated to job postings.
 * Submit this URL to Google Search Console to accelerate indexing.
 */
export async function GET() {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://www.opai.cl";

  const jobs = await prisma.atsJobPosting.findMany({
    where: { estado: "ACTIVO" },
    select: {
      jsonLdSlug: true,
      updatedAt: true,
      createdAt: true,
      tenant: { select: { slug: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const urls = jobs
    .filter((j) => j.jsonLdSlug)
    .map(
      (job) => `
  <url>
    <loc>${siteUrl}/empleos/${job.tenant.slug}/${job.jsonLdSlug}</loc>
    <lastmod>${(job.updatedAt || job.createdAt).toISOString()}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`,
    )
    .join("");

  const tenantSlugs = [...new Set(jobs.map((j) => j.tenant.slug))];
  const listPages = tenantSlugs
    .map(
      (slug) => `
  <url>
    <loc>${siteUrl}/empleos/${slug}</loc>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>`,
    )
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}/empleos</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
${listPages}
${urls}
</urlset>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
