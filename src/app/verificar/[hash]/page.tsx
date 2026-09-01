import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { verifyMarcacionHash } from "@/lib/marcacion";
import {
  formatFechaComprobante,
  formatHoraComprobante,
  formatRutComprobante,
  isSha256Hex,
} from "@/lib/marcacion-format";
import { formatPersonName } from "@/lib/personas";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Verificar comprobante de marcación",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ hash: string }>;
}

export default async function VerificarComprobantePage({ params }: PageProps) {
  const { hash } = await params;
  const normalized = hash.trim().toLowerCase();

  if (!isSha256Hex(normalized)) {
    return <VerifyShell><p className="text-[13px] text-ds-text-2">No encontrado.</p></VerifyShell>;
  }

  const marcacion = await prisma.opsMarcacion.findFirst({
    where: { hashIntegridad: normalized },
    select: {
      tenantId: true,
      guardiaId: true,
      installationId: true,
      tipo: true,
      timestamp: true,
      lat: true,
      lng: true,
      metodoId: true,
      hashIntegridad: true,
      isModified: true,
      deletedAt: true,
      employerName: true,
      employerRut: true,
      installation: { select: { name: true } },
      guardia: {
        select: { persona: { select: { firstName: true, lastName: true, rut: true } } },
      },
    },
  });

  if (!marcacion) {
    return <VerifyShell><p className="text-[13px] text-ds-text-2">No encontrado.</p></VerifyShell>;
  }

  const integrity = verifyMarcacionHash({
    guardiaId: marcacion.guardiaId,
    installationId: marcacion.installationId,
    tipo: marcacion.tipo,
    timestamp: marcacion.timestamp,
    lat: marcacion.lat,
    lng: marcacion.lng,
    metodoId: marcacion.metodoId,
    tenantId: marcacion.tenantId,
    hashIntegridad: marcacion.hashIntegridad,
  });

  const persona = marcacion.guardia.persona;
  const status = marcacion.deletedAt
    ? "Marca eliminada"
    : marcacion.isModified
      ? "Marca modificada"
      : integrity.isValid
        ? "Comprobante válido"
        : "Integridad no coincide";

  return (
    <VerifyShell>
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff; } }`}</style>
      <p className={`text-[14px] font-semibold ${integrity.isValid && !marcacion.deletedAt ? "text-status-ok-fg" : "text-status-warn-fg"}`}>
        {status}
      </p>
      <dl className="mt-4 space-y-2 text-[13px]">
        <Row label="Trabajador" value={formatPersonName(persona.firstName, persona.lastName)} />
        <Row label="RUT" value={formatRutComprobante(persona.rut ?? "")} />
        <Row label="Tipo" value={marcacion.tipo} />
        <Row label="Fecha" value={formatFechaComprobante(marcacion.timestamp)} />
        <Row label="Hora" value={formatHoraComprobante(marcacion.timestamp)} />
        <Row label="Empleador" value={marcacion.employerName ?? "—"} />
        <Row label="RUT empleador" value={marcacion.employerRut ?? "—"} />
        <Row label="Instalación" value={marcacion.installation.name} />
      </dl>
      <p className="mt-4 break-all font-mono text-[12px] text-ds-text-3">{marcacion.hashIntegridad}</p>
    </VerifyShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ds-text-3">{label}</dt>
      <dd className="text-right font-medium text-ds-text-1">{value}</dd>
    </div>
  );
}

function VerifyShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh max-w-[560px] px-6 py-8">
      <h1 className="font-display text-xl font-semibold text-ds-text-1">
        Verificar comprobante de marcación
      </h1>
      <p className="mt-1 text-[13px] text-ds-text-3">
        Res. Exenta N°38 — Dirección del Trabajo de Chile
      </p>
      <section className="mt-6 rounded-2xl border border-ds-border-default bg-ds-surface-1 p-5">
        {children}
      </section>
    </main>
  );
}
