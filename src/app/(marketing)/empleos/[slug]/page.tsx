import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Script from "next/script";
import { prisma } from "@/lib/prisma";

function mapTurnoToEmploymentType(turno: string): string {
  switch (turno) {
    case "4x4_dia":
    case "4x4_noche":
    case "5x2":
    case "6x1":
      return "FULL_TIME";
    default:
      return "OTHER";
  }
}

const TURNO_LABELS: Record<string, string> = {
  "4x4_dia": "4×4 Día",
  "4x4_noche": "4×4 Noche",
  "5x2": "5×2",
  "6x1": "6×1",
  otro: "Otro",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const job = await prisma.atsJobPosting.findUnique({
    where: { jsonLdSlug: slug },
    select: { titulo: true, descripcion: true, region: true },
  });

  if (!job) return { title: "Empleo no encontrado" };

  return {
    title: `${job.titulo} — Empleo en ${job.region} | Opai`,
    description: job.descripcion.slice(0, 160),
    alternates: { canonical: `https://www.opai.cl/empleos/${slug}` },
  };
}

export default async function EmpleoDetallePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const job = await prisma.atsJobPosting.findUnique({
    where: { jsonLdSlug: slug },
    include: { tenant: { select: { name: true, slug: true } } },
  });

  if (!job || job.estado !== "ACTIVO") notFound();

  // JSON-LD for Google Jobs
  const jsonLd = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: job.titulo,
    description: job.descripcion,
    datePosted: job.createdAt.toISOString().split("T")[0],
    validThrough: job.expiraAt?.toISOString(),
    employmentType: mapTurnoToEmploymentType(job.turno),
    hiringOrganization: {
      "@type": "Organization",
      name: job.tenant.name,
      sameAs: "https://opai.cl",
    },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: job.commune ?? job.region,
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
              maxValue: job.rentaMax ?? job.rentaMin,
              unitText: "MONTH",
            },
          },
        }
      : {}),
    applicationContact: {
      "@type": "ContactPoint",
      contactType: "HR",
      url: `https://opai.cl/empleos/${job.tenant.slug}/${job.jsonLdSlug}`,
    },
  };

  return (
    <>
      <Script
        id="job-posting-jsonld"
        type="application/ld+json"
        strategy="beforeInteractive"
      >
        {JSON.stringify(jsonLd)}
      </Script>

      <section className="mk-section">
        <div className="mk-container" style={{ maxWidth: "720px" }}>
          <Link
            href="/empleos"
            style={{ color: "var(--mk-muted)", fontSize: "0.9rem", marginBottom: "24px", display: "inline-block" }}
          >
            &#8592; Volver a empleos
          </Link>

          <h1 style={{
            fontFamily: "var(--mk-font-h)",
            fontSize: "clamp(1.5rem, 4vw, 2.2rem)",
            fontWeight: 800,
            color: "var(--mk-text)",
            marginBottom: "8px",
          }}>
            {job.titulo}
          </h1>

          <p style={{ color: "var(--mk-muted)", fontSize: "1rem", marginBottom: "24px" }}>
            {job.tenant.name} &middot; {job.commune ?? job.region}
          </p>

          {/* Key details */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: "16px",
            marginBottom: "32px",
          }}>
            <DetailCard label="Turno" value={TURNO_LABELS[job.turno] ?? job.turno} />
            <DetailCard label="Región" value={job.region} />
            <DetailCard label="Vacantes" value={job.vacantes.toString()} />
            {job.rentaMin && (
              <DetailCard
                label="Renta"
                value={`$${job.rentaMin.toLocaleString("es-CL")}${job.rentaMax ? ` — $${job.rentaMax.toLocaleString("es-CL")}` : "+"}`}
              />
            )}
            <DetailCard label="OS10" value={job.requiereOS10 ? "Requerido" : "No requerido"} />
            {job.experienciaMinAnios ? (
              <DetailCard label="Experiencia" value={`${job.experienciaMinAnios}+ años`} />
            ) : null}
          </div>

          {/* Description */}
          <div style={{
            background: "var(--mk-card)",
            borderRadius: "12px",
            padding: "24px",
            border: "1px solid var(--mk-border)",
            marginBottom: "24px",
          }}>
            <h2 style={{
              fontFamily: "var(--mk-font-h)",
              fontSize: "1.1rem",
              fontWeight: 700,
              color: "var(--mk-text)",
              marginBottom: "12px",
            }}>
              Descripción del cargo
            </h2>
            <p style={{
              color: "var(--mk-muted)",
              fontSize: "0.95rem",
              lineHeight: 1.75,
              whiteSpace: "pre-wrap",
            }}>
              {job.descripcion}
            </p>
          </div>

          {job.funciones && (
            <div style={{
              background: "var(--mk-card)",
              borderRadius: "12px",
              padding: "24px",
              border: "1px solid var(--mk-border)",
              marginBottom: "24px",
            }}>
              <h2 style={{
                fontFamily: "var(--mk-font-h)",
                fontSize: "1.1rem",
                fontWeight: 700,
                color: "var(--mk-text)",
                marginBottom: "12px",
              }}>
                Funciones
              </h2>
              <p style={{
                color: "var(--mk-muted)",
                fontSize: "0.95rem",
                lineHeight: 1.75,
                whiteSpace: "pre-wrap",
              }}>
                {job.funciones}
              </p>
            </div>
          )}

          {/* CTA */}
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <Link href="/portal/guardia-postulante" className="mk-btn-primary">
              Postular ahora
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: "var(--mk-card)",
      borderRadius: "8px",
      padding: "12px 16px",
      border: "1px solid var(--mk-border)",
    }}>
      <p style={{ color: "var(--mk-muted)", fontSize: "0.75rem", marginBottom: "4px" }}>{label}</p>
      <p style={{ color: "var(--mk-text)", fontWeight: 600, fontSize: "0.95rem" }}>{value}</p>
    </div>
  );
}
