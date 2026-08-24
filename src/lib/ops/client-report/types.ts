export type ReportFrequency = "weekly" | "monthly";

export type SectionFlags = {
  includeAsistencia: boolean;
  includeCobertura: boolean;
  includeRondas: boolean;
  includeIncidentes: boolean;
  includeVisitas: boolean;
};

export type ReportPeriod = {
  from: Date;
  to: Date;
  key: string;
  label: string;
};

export type VisitFindingRow = {
  description: string;
  status: string;
  category: string;
};

export type VisitRow = {
  id: string;
  installationId: string;
  installationName: string;
  supervisorName: string;
  checkInAt: string;
  checkOutAt: string | null;
  durationMinutes: number | null;
  installationState: string | null;
  generalComments: string | null;
  findings: VisitFindingRow[];
};

export type VisitReportData = {
  kind: "visits";
  companyName: string;
  commercialName: string;
  accountName: string;
  periodLabel: string;
  generatedAtLabel: string;
  installations: Array<{
    id: string;
    name: string;
    address: string | null;
    visits: VisitRow[];
  }>;
};

export type DigestKpis = {
  asistenciaPct: number | null;
  coberturaPct: number | null;
  slotsCovered: number;
  slotsTotal: number;
  rondasCompleted: number;
  rondasTotal: number;
  rondasPct: number | null;
  incidentesTotal: number;
  incidentesResueltos: number;
  incidentesAbiertos: number;
  visitasCount: number;
};

export type DigestIncidente = {
  code: string;
  title: string;
  createdAt: string;
  resolved: boolean;
  statusLabel: string;
};

export type DigestReportData = {
  kind: "digest";
  companyName: string;
  commercialName: string;
  accountName: string;
  installationName: string;
  installationAddress: string | null;
  periodLabel: string;
  generatedAtLabel: string;
  sections: SectionFlags;
  kpis: DigestKpis;
  visits: VisitRow[];
  incidentes: DigestIncidente[];
};

export type AttendanceSlotRow = {
  attendanceStatus: string;
};

export const COVERED_ATTENDANCE = new Set([
  "asistio",
  "reemplazo",
  "presente",
  "confirmado_llegada",
]);

export const ABSENT_ATTENDANCE = new Set(["no_asistio"]);
export const UNCOVERED_ATTENDANCE = new Set(["ppc"]);

export const TERMINAL_TICKET = new Set([
  "resolved",
  "closed",
  "rejected",
  "cancelled",
]);

export const COMPLETED_RONDA = new Set(["completada"]);
