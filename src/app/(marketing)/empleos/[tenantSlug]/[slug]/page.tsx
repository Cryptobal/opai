import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { resolveTenantFromSlug } from "@/lib/tenant";
import { getTenantCompanyConfig } from "@/lib/tenant-config";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function mapTurnoToEmploymentType(turno: string): string {
  switch (turno) {
    case "4x4_dia":
    case "4x4_noche":
    case "5x2":
    case "6x1":
      return "FULL_TIME";
    default:
      return "FULL_TIME";
  }
}

const TURNO_LABELS: Record<string, string> = {
  "4x4_dia": "4x4 Dia",
  "4x4_noche": "4x4 Noche",
  "5x2": "5x2",
  "6x1": "6x1",
  otro: "Otro",
};

function formatDate(date: Date): string {
  return date.toLocaleDateString("es-CL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/* ------------------------------------------------------------------ */
/*  Metadata                                                           */
/* ------------------------------------------------------------------ */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenantSlug: string; slug: string }>;
}): Promise<Metadata> {
  const { tenantSlug, slug } = await params;
  const tenant = await resolveTenantFromSlug(tenantSlug);
  if (!tenant) return { title: "Empleo no encontrado" };

  const cfg = await getTenantCompanyConfig(tenant.id);
  const companyName = cfg.commercialName || cfg.companyName;

  const job = await prisma.atsJobPosting.findFirst({
    where: { jsonLdSlug: slug, tenantId: tenant.id, estado: "ACTIVO" },
    select: { titulo: true, descripcion: true, region: true },
  });

  if (!job) return { title: "Empleo no encontrado" };

  return {
    title: `${job.titulo} — ${companyName} | OPAI`,
    description: job.descripcion.slice(0, 160),
    alternates: {
      canonical: `https://www.opai.cl/empleos/${tenantSlug}/${slug}`,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default async function TenantJobDetailPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; slug: string }>;
}) {
  const { tenantSlug, slug } = await params;
  const tenant = await resolveTenantFromSlug(tenantSlug);
  if (!tenant) notFound();

  const cfg = await getTenantCompanyConfig(tenant.id);
  const companyName = cfg.commercialName || cfg.companyName;
  const logoUrl = cfg.brandingLogoWhite || cfg.brandingLogoFull || cfg.logoUrl;

  const job = await prisma.atsJobPosting.findFirst({
    where: { jsonLdSlug: slug, tenantId: tenant.id, estado: "ACTIVO" },
  });

  if (!job) notFound();

  /* ---- JSON-LD structured data ---- */
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.titulo,
    description: job.descripcion,
    datePosted: job.createdAt.toISOString(),
    validThrough: job.expiraAt?.toISOString(),
    employmentType: mapTurnoToEmploymentType(job.turno),
    hiringOrganization: {
      "@type": "Organization",
      name: companyName,
      sameAs: cfg.website || undefined,
      logo: cfg.brandingLogoFull || cfg.logoUrl || undefined,
    },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: job.commune || undefined,
        addressRegion: job.region,
        addressCountry: "CL",
      },
    },
    ...(job.rentaMin
      ? {
          baseSalary: {
            "@type": "MonetaryAmount",
            currency: "CLP",
            value: {
              "@type": "QuantitativeValue",
              minValue: job.rentaMin,
              maxValue: job.rentaMax || job.rentaMin,
              unitText: "MONTH",
            },
          },
        }
      : {}),
    ...(job.requiereOS10
      ? { qualifications: "Credencial OS10 vigente" }
      : {}),
  };

  return (
    <>
      {/* JSON-LD for Google Jobs */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section className="min-h-screen bg-[#0a1628] py-16 px-4">
        <div className="mx-auto max-w-3xl">
          {/* Back link */}
          <Link
            href={`/empleos/${tenantSlug}`}
            className="mb-8 inline-flex items-center text-sm text-slate-400 transition-colors hover:text-slate-200"
          >
            &larr; Volver a ofertas
          </Link>

          {/* Company header */}
          <div className="mb-8 flex items-center gap-4">
            {logoUrl && (
              <Image
                src={logoUrl}
                alt={companyName}
                width={120}
                height={40}
                className="h-10 w-auto object-contain"
              />
            )}
            <span className="text-sm text-slate-400">{companyName}</span>
          </div>

          {/* Title */}
          <h1 className="mb-4 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            {job.titulo}
          </h1>

          <p className="mb-8 text-slate-400">
            {job.commune ? `${job.commune}, ` : ""}
            {job.region}
          </p>

          {/* Key details grid */}
          <div className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <DetailCard label="Turno" value={TURNO_LABELS[job.turno] ?? job.turno} />
            <DetailCard label="Region" value={job.region} />
            <DetailCard label="Vacantes" value={job.vacantes.toString()} />
            {job.rentaMin && (
              <DetailCard
                label="Renta"
                value={`$${job.rentaMin.toLocaleString("es-CL")}${job.rentaMax ? ` - $${job.rentaMax.toLocaleString("es-CL")}` : "+"}`}
              />
            )}
            <DetailCard
              label="OS10"
              value={job.requiereOS10 ? "Requerido" : "No requerido"}
            />
            <DetailCard
              label="Movilizacion"
              value={job.requiereMovilizacion ? "Requerida" : "No requerida"}
            />
            {job.experienciaMinAnios ? (
              <DetailCard
                label="Experiencia"
                value={`${job.experienciaMinAnios}+ anios`}
              />
            ) : null}
          </div>

          {/* Description */}
          <div className="mb-6 rounded-xl border border-slate-800 bg-slate-900/50 p-6">
            <h2 className="mb-3 text-lg font-bold text-white">
              Descripcion del cargo
            </h2>
            <p className="whitespace-pre-wrap leading-relaxed text-slate-300">
              {job.descripcion}
            </p>
          </div>

          {/* Funciones */}
          {job.funciones && (
            <div className="mb-6 rounded-xl border border-slate-800 bg-slate-900/50 p-6">
              <h2 className="mb-3 text-lg font-bold text-white">Funciones</h2>
              <p className="whitespace-pre-wrap leading-relaxed text-slate-300">
                {job.funciones}
              </p>
            </div>
          )}

          {/* Dates */}
          <div className="mb-10 flex flex-wrap gap-6 text-sm text-slate-500">
            <span>Publicado: {formatDate(job.createdAt)}</span>
            {job.expiraAt && (
              <span>Expira: {formatDate(job.expiraAt)}</span>
            )}
          </div>

          {/* CTA */}
          <div className="text-center">
            <Link
              href="/portal/guardia-postulante/ofertas"
              className="inline-flex items-center rounded-lg bg-emerald-500 px-8 py-3 text-lg font-bold text-white transition-colors hover:bg-emerald-600"
            >
              Postular ahora
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Detail card component                                              */
/* ------------------------------------------------------------------ */

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3">
      <p className="mb-1 text-xs text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-white">{value}</p>
    </div>
  );
}
