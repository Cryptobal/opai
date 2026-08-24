import { prisma } from "@/lib/prisma";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { buildDigestKpis, isTicketResolved } from "./aggregate";
import { formatDateTimeCl } from "./period";
import type {
  DigestIncidente,
  DigestReportData,
  SectionFlags,
  VisitFindingRow,
  VisitReportData,
  VisitRow,
} from "./types";
import type { ReportPeriod } from "./types";

const DEFAULT_SECTIONS: SectionFlags = {
  includeAsistencia: true,
  includeCobertura: true,
  includeRondas: true,
  includeIncidentes: true,
  includeVisitas: true,
};

function ticketStatusLabel(status: string): string {
  const s = status.toLowerCase();
  if (s === "resolved" || s === "closed") return "Resuelto";
  if (s === "in_progress") return "En curso";
  if (s === "waiting") return "En espera";
  if (s === "cancelled" || s === "rejected") return "Cerrado";
  return "Abierto";
}

function findingStatusLabel(status: string): string {
  const s = status.toLowerCase();
  if (s === "resolved" || s === "closed") return "Resuelto";
  if (s === "in_progress") return "En curso";
  return "Abierto";
}

async function loadCompany(tenantId: string) {
  const cfg = await getTenantCompanyConfig(tenantId);
  return {
    companyName: cfg.razonSocial || cfg.companyName || "GARD Security",
    commercialName: cfg.commercialName || cfg.companyName || "GARD Security",
  };
}

async function loadVisits(opts: {
  tenantId: string;
  installationIds: string[];
  from: Date;
  to: Date;
}): Promise<VisitRow[]> {
  const visits = await prisma.opsVisitaSupervision.findMany({
    where: {
      tenantId: opts.tenantId,
      installationId: { in: opts.installationIds },
      status: "completed",
      checkInAt: { gte: opts.from, lt: opts.to },
    },
    orderBy: { checkInAt: "asc" },
    select: {
      id: true,
      installationId: true,
      checkInAt: true,
      checkOutAt: true,
      durationMinutes: true,
      installationState: true,
      generalComments: true,
      supervisor: { select: { name: true } },
      installation: { select: { name: true } },
      findings: {
        select: { description: true, status: true, category: true },
        orderBy: { createdAt: "asc" },
        take: 20,
      },
    },
  });

  return visits.map((v) => ({
    id: v.id,
    installationId: v.installationId,
    installationName: v.installation.name,
    supervisorName: v.supervisor.name,
    checkInAt: v.checkInAt.toISOString(),
    checkOutAt: v.checkOutAt ? v.checkOutAt.toISOString() : null,
    durationMinutes: v.durationMinutes,
    installationState: v.installationState,
    generalComments: v.generalComments,
    findings: v.findings.map(
      (f): VisitFindingRow => ({
        description: f.description,
        status: findingStatusLabel(f.status),
        category: f.category,
      })
    ),
  }));
}

export async function collectVisitReport(opts: {
  tenantId: string;
  accountId: string;
  installationIds: string[];
  period: ReportPeriod;
}): Promise<VisitReportData> {
  const [company, account, installations, visits] = await Promise.all([
    loadCompany(opts.tenantId),
    prisma.crmAccount.findFirst({
      where: { id: opts.accountId, tenantId: opts.tenantId },
      select: { name: true },
    }),
    prisma.crmInstallation.findMany({
      where: {
        tenantId: opts.tenantId,
        id: { in: opts.installationIds },
      },
      select: { id: true, name: true, address: true, commune: true, city: true },
      orderBy: { name: "asc" },
    }),
    loadVisits({
      tenantId: opts.tenantId,
      installationIds: opts.installationIds,
      from: opts.period.from,
      to: opts.period.to,
    }),
  ]);

  const byInst = new Map<string, VisitRow[]>();
  for (const v of visits) {
    const list = byInst.get(v.installationId) ?? [];
    list.push(v);
    byInst.set(v.installationId, list);
  }

  return {
    kind: "visits",
    companyName: company.companyName,
    commercialName: company.commercialName,
    accountName: account?.name ?? "Cliente",
    periodLabel: opts.period.label,
    generatedAtLabel: formatDateTimeCl(new Date()),
    installations: installations.map((inst) => ({
      id: inst.id,
      name: inst.name,
      address: [inst.address, inst.commune, inst.city].filter(Boolean).join(", ") || null,
      visits: byInst.get(inst.id) ?? [],
    })),
  };
}

export async function collectDigestReport(opts: {
  tenantId: string;
  installationId: string;
  period: ReportPeriod;
  sections?: Partial<SectionFlags>;
}): Promise<DigestReportData> {
  const sections: SectionFlags = { ...DEFAULT_SECTIONS, ...opts.sections };
  const installation = await prisma.crmInstallation.findFirst({
    where: { id: opts.installationId, tenantId: opts.tenantId },
    select: {
      id: true,
      name: true,
      address: true,
      commune: true,
      city: true,
      account: { select: { name: true } },
    },
  });
  if (!installation) {
    throw new Error("Instalación no encontrada");
  }

  const [company, slots, rondaRows, ticketRows, visits] = await Promise.all([
    loadCompany(opts.tenantId),
    prisma.opsAsistenciaDiaria.findMany({
      where: {
        tenantId: opts.tenantId,
        installationId: opts.installationId,
        date: { gte: opts.period.from, lt: opts.period.to },
      },
      select: { attendanceStatus: true },
    }),
    prisma.opsRondaEjecucion.findMany({
      where: {
        tenantId: opts.tenantId,
        scheduledAt: { gte: opts.period.from, lt: opts.period.to },
        OR: [
          { installationId: opts.installationId },
          { rondaTemplate: { installationId: opts.installationId } },
        ],
      },
      select: { status: true },
    }),
    prisma.opsTicket.findMany({
      where: {
        tenantId: opts.tenantId,
        installationId: opts.installationId,
        source: "public_qr",
        createdAt: { gte: opts.period.from, lt: opts.period.to },
      },
      orderBy: { createdAt: "asc" },
      take: 50,
      select: {
        code: true,
        title: true,
        status: true,
        createdAt: true,
      },
    }),
    loadVisits({
      tenantId: opts.tenantId,
      installationIds: [opts.installationId],
      from: opts.period.from,
      to: opts.period.to,
    }),
  ]);

  const incidentes: DigestIncidente[] = ticketRows.map((t) => ({
    code: t.code,
    title: t.title,
    createdAt: t.createdAt.toISOString(),
    resolved: isTicketResolved(t.status),
    statusLabel: ticketStatusLabel(t.status),
  }));

  const kpis = buildDigestKpis({
    slots,
    rondaStatuses: rondaRows.map((r) => r.status),
    incidentesTotal: incidentes.length,
    incidentesResueltos: incidentes.filter((i) => i.resolved).length,
    visitasCount: visits.length,
  });

  return {
    kind: "digest",
    companyName: company.companyName,
    commercialName: company.commercialName,
    accountName: installation.account?.name ?? "Cliente",
    installationName: installation.name,
    installationAddress:
      [installation.address, installation.commune, installation.city]
        .filter(Boolean)
        .join(", ") || null,
    periodLabel: opts.period.label,
    generatedAtLabel: formatDateTimeCl(new Date()),
    sections,
    kpis,
    visits,
    incidentes,
  };
}
