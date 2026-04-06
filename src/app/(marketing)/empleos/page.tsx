import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Empleos Guardias de Seguridad Chile | Opai",
  description: "Encuentra empleo como guardia de seguridad en Chile. Ofertas actualizadas de las principales empresas de seguridad privada.",
  alternates: { canonical: "https://www.opai.cl/empleos" },
  openGraph: {
    title: "Empleos Guardias de Seguridad Chile | OPAI",
    description: "Ofertas de empleo actualizadas para guardias de seguridad en Chile. Postula directamente desde la plataforma.",
    url: "https://www.opai.cl/empleos",
  },
};

const TURNO_LABELS: Record<string, string> = {
  "4x4_dia": "4×4 Día",
  "4x4_noche": "4×4 Noche",
  "5x2": "5×2",
  "6x1": "6×1",
  otro: "Otro",
};

export const dynamic = "force-dynamic";

export default async function EmpleosPage() {
  let jobs: Array<{
    id: string;
    titulo: string;
    turno: string;
    region: string;
    commune: string | null;
    rentaMin: number | null;
    jsonLdSlug: string | null;
    tenant: { name: string; slug: string };
  }> = [];

  try {
    jobs = await prisma.atsJobPosting.findMany({
      where: { estado: "ACTIVO" },
      select: {
        id: true,
        titulo: true,
        turno: true,
        region: true,
        commune: true,
        rentaMin: true,
        jsonLdSlug: true,
        tenant: { select: { name: true, slug: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  } catch (err) {
    console.error("[ATS] Error loading public jobs:", err);
  }

  return (
    <section className="mk-section">
      <div className="mk-container">
        <h1 style={{
          fontFamily: "var(--mk-font-h)",
          fontSize: "clamp(1.8rem, 4vw, 2.5rem)",
          fontWeight: 800,
          color: "var(--mk-text)",
          marginBottom: "16px",
          textAlign: "center",
        }}>
          Empleos para guardias de seguridad
        </h1>
        <p style={{
          color: "var(--mk-muted)",
          textAlign: "center",
          marginBottom: "40px",
          maxWidth: "500px",
          margin: "0 auto 40px",
        }}>
          {jobs.length} ofertas activas en todo Chile
        </p>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: "20px",
        }}>
          {jobs.map((job) => (
            <Link
              key={job.id}
              href={`/empleos/${job.tenant.slug}/${job.jsonLdSlug}`}
              style={{
                background: "var(--mk-card)",
                borderRadius: "12px",
                padding: "24px",
                border: "1px solid var(--mk-border)",
                textDecoration: "none",
                display: "block",
                transition: "box-shadow 0.2s",
              }}
            >
              <h3 style={{
                fontFamily: "var(--mk-font-h)",
                fontSize: "1.1rem",
                fontWeight: 700,
                color: "var(--mk-text)",
                marginBottom: "8px",
              }}>
                {job.titulo}
              </h3>
              <p style={{ color: "var(--mk-muted)", fontSize: "0.9rem", marginBottom: "12px" }}>
                {job.tenant.name}
              </p>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <span style={{
                  background: "var(--mk-border)",
                  borderRadius: "6px",
                  padding: "4px 8px",
                  fontSize: "0.8rem",
                  color: "var(--mk-muted)",
                }}>
                  {TURNO_LABELS[job.turno] ?? job.turno}
                </span>
                <span style={{
                  background: "var(--mk-border)",
                  borderRadius: "6px",
                  padding: "4px 8px",
                  fontSize: "0.8rem",
                  color: "var(--mk-muted)",
                }}>
                  {job.commune ?? job.region}
                </span>
                {job.rentaMin && (
                  <span style={{
                    background: "var(--mk-border)",
                    borderRadius: "6px",
                    padding: "4px 8px",
                    fontSize: "0.8rem",
                    color: "var(--mk-muted)",
                  }}>
                    ${job.rentaMin.toLocaleString("es-CL")}+
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>

        {jobs.length === 0 && (
          <p style={{ textAlign: "center", color: "var(--mk-muted)", padding: "60px 0" }}>
            No hay ofertas activas en este momento. Vuelve pronto.
          </p>
        )}
      </div>
    </section>
  );
}
