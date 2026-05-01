import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { resolveTenantFromSlug } from "@/lib/tenant";
import { getTenantCompanyConfig } from "@/lib/tenant-config";

const TURNO_LABELS: Record<string, string> = {
  "4x4_dia": "4x4 Dia",
  "4x4_noche": "4x4 Noche",
  "5x2": "5x2",
  "6x1": "6x1",
  otro: "Otro",
};

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}): Promise<Metadata> {
  const { tenantSlug } = await params;
  const tenant = await resolveTenantFromSlug(tenantSlug);
  if (!tenant) return { title: "Empresa no encontrada" };

  const cfg = await getTenantCompanyConfig(tenant.id);
  const companyName = cfg.commercialName || cfg.companyName;

  const title = `Empleos ${companyName} | OPAI`;
  const description = `Encuentra empleo como guardia de seguridad en ${companyName}. Ofertas actualizadas con turno, renta y ubicacion.`;
  const url = `https://www.opai.cl/empleos/${tenantSlug}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "OPAI",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

function daysSince(date: Date): number {
  return Math.floor(
    (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24),
  );
}

function formatDaysSince(days: number): string {
  if (days === 0) return "Hoy";
  if (days === 1) return "Hace 1 dia";
  return `Hace ${days} dias`;
}

export default async function TenantEmpleosPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await resolveTenantFromSlug(tenantSlug);
  if (!tenant) notFound();

  const cfg = await getTenantCompanyConfig(tenant.id);
  const companyName = cfg.commercialName || cfg.companyName;
  const logoUrl = cfg.brandingLogoWhite || cfg.brandingLogoFull || cfg.logoUrl;
  if (!logoUrl) {
    console.warn(
      `[empleos] Tenant ${tenantSlug} (${tenant.id}) has no logo configured in Settings ` +
        `(empresa.branding.logoWhite | empresa.branding.logoFull | empresa.logoUrl)`
    );
  }

  const jobs = await prisma.atsJobPosting.findMany({
    where: { tenantId: tenant.id, estado: "ACTIVO" },
    select: {
      id: true,
      titulo: true,
      turno: true,
      region: true,
      commune: true,
      rentaMin: true,
      rentaMax: true,
      vacantes: true,
      jsonLdSlug: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <section className="min-h-screen bg-[#0a1628] py-16 px-4">
      <div className="mx-auto max-w-5xl">
        {/* Header with tenant branding */}
        <div className="mb-12 text-center">
          {logoUrl && (
            <div className="mb-6 flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt={companyName}
                className="h-14 w-auto object-contain"
              />
            </div>
          )}
          <h1 className="mb-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Ofertas de empleo
          </h1>
          <p className="mx-auto max-w-lg text-slate-400">
            {jobs.length > 0
              ? `${jobs.length} oferta${jobs.length !== 1 ? "s" : ""} activa${jobs.length !== 1 ? "s" : ""} en ${companyName}`
              : `${companyName}`}
          </p>
        </div>

        {/* Job cards grid */}
        {jobs.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {jobs.map((job) => {
              const days = daysSince(job.createdAt);
              return (
                <div
                  key={job.id}
                  className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/50 p-6 transition-colors hover:border-status-ok-border"
                >
                  <h3 className="mb-2 text-lg font-bold text-white">
                    {job.titulo}
                  </h3>

                  <p className="mb-4 text-sm text-slate-400">
                    {job.commune ? `${job.commune}, ` : ""}
                    {job.region}
                  </p>

                  {/* Badges */}
                  <div className="mb-4 flex flex-wrap gap-2">
                    <span className="rounded-md bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-300">
                      {TURNO_LABELS[job.turno] ?? job.turno}
                    </span>
                    {job.rentaMin && (
                      <span className="rounded-md bg-status-ok-soft px-2.5 py-1 text-xs font-medium text-status-ok-fg">
                        ${job.rentaMin.toLocaleString("es-CL")}
                        {job.rentaMax
                          ? ` - $${job.rentaMax.toLocaleString("es-CL")}`
                          : "+"}
                      </span>
                    )}
                    <span className="rounded-md bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-300">
                      {job.vacantes} vacante{job.vacantes !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {/* Footer */}
                  <div className="mt-auto flex items-center justify-between pt-4">
                    <span className="text-xs text-slate-500">
                      {formatDaysSince(days)}
                    </span>
                    <Link
                      href={`/empleos/${tenantSlug}/${job.jsonLdSlug}`}
                      className="inline-flex items-center rounded-lg bg-status-ok px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-status-ok"
                    >
                      Postular
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 py-20 text-center">
            <p className="text-lg text-slate-400">
              No hay ofertas activas en este momento.
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Vuelve pronto para ver nuevas oportunidades.
            </p>
          </div>
        )}

        {/* Back link */}
        <div className="mt-10 text-center">
          <Link
            href="/empleos"
            className="text-sm text-slate-500 transition-colors hover:text-slate-300"
          >
            &larr; Ver todas las ofertas
          </Link>
        </div>
      </div>
    </section>
  );
}
