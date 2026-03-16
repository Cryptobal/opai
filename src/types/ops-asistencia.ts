/* ──────────────────────────────────────────────────────────────────────────
   Types for the Asistencia Diaria (Daily Attendance) module.
   Extracted from OpsPautaDiariaClient.tsx for reuse across sub-components.
   ────────────────────────────────────────────────────────────────────────── */

// ── Attendance & TE status types ────────────────────────────────────────

export type AttendanceStatus = "pendiente" | "asistio" | "no_asistio" | "reemplazo" | "ppc";
export type TeStatus = "pending" | "approved" | "rejected" | "paid";

export const TE_PRIORITY: Record<string, number> = {
  paid: 0,
  approved: 1,
  pending: 2,
  rejected: 99,
};

export const STATUS_CONFIG: Record<AttendanceStatus, {
  bg: string;
  border: string;
  icon: string;
  label: string;
  color: string;
}> = {
  asistio:    { bg: "bg-emerald-500/10", border: "border-l-emerald-500", icon: "\u2713", label: "Presente",  color: "text-emerald-400" },
  pendiente:  { bg: "bg-slate-500/5",    border: "border-l-slate-600",   icon: "\u00B7", label: "Pendiente", color: "text-slate-400" },
  no_asistio: { bg: "bg-red-500/10",     border: "border-l-red-500",     icon: "\u2717", label: "Ausente",   color: "text-red-400" },
  reemplazo:  { bg: "bg-violet-500/10",  border: "border-l-violet-500",  icon: "\u21BA", label: "Reemplazo", color: "text-violet-400" },
  ppc:        { bg: "bg-amber-500/10",   border: "border-l-amber-500",   icon: "\u23F3", label: "PPC",       color: "text-amber-400" },
};

// ── Data types ──────────────────────────────────────────────────────────

export type ClientOption = {
  id: string;
  name: string;
  installations: { id: string; name: string }[];
};

export type GuardiaOption = {
  id: string;
  code?: string | null;
  lifecycleStatus?: string;
  persona: { firstName: string; lastName: string; rut?: string | null };
};

export type MarcacionItem = {
  id: string;
  tipo: string;
  timestamp: string;
  hashIntegridad: string;
  geoValidada: boolean;
  geoDistanciaM: number | null;
  gpsStatus?: string; // dentro_rango | fuera_rango | sin_gps
  lat: number | null;
  lng: number | null;
  ipAddress: string | null;
  userAgent: string | null;
  metodoId?: string | null; // "face_id" | "pin_fallback" | "rut_pin" | "manual"
  pinFallbackReason?: string | null;
};

export type TurnoExtraItem = {
  id: string;
  status: string;
  amountClp: string | number;
  amountJustification?: string | null;
  tipo?: string;
  horasExtra?: string | number | null;
};

export type GuardiaRef = {
  id: string;
  code?: string | null;
  lifecycleStatus?: string;
  persona: { firstName: string; lastName: string };
};

export type PuestoRef = {
  id: string;
  name: string;
  shiftStart: string;
  shiftEnd: string;
  teMontoClp?: string | number | null;
  requiredGuards?: number;
};

export type AsistenciaItem = {
  id: string;
  date: string;
  slotNumber: number;
  attendanceStatus: string;
  plannedGuardiaId?: string | null;
  actualGuardiaId?: string | null;
  replacementGuardiaId?: string | null;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  checkInSource?: string | null;
  checkOutSource?: string | null;
  plannedMinutes?: number;
  workedMinutes?: number;
  overtimeMinutes?: number;
  lateMinutes?: number;
  lockedAt?: string | null;
  installation: { id: string; name: string };
  puesto: PuestoRef;
  plannedGuardia?: GuardiaRef | null;
  actualGuardia?: GuardiaRef | null;
  replacementGuardia?: GuardiaRef | null;
  turnosExtra?: TurnoExtraItem[];
  marcaciones?: MarcacionItem[];
};

// ── Metrics type ────────────────────────────────────────────────────────

export type AsistenciaMetrics = {
  total: number;
  cubiertos: number;
  ppc: number;
  te: number;
  coberturaPct: number;
};

// ── Grouped data ────────────────────────────────────────────────────────

export type InstallationGroup = {
  name: string;
  items: AsistenciaItem[];
};

// ── Helper functions ────────────────────────────────────────────────────

export function isDayShift(shiftStart: string): boolean {
  const match = shiftStart.match(/^(\d{1,2})/);
  const hour = match ? parseInt(match[1], 10) : 12;
  return hour < 12;
}

export function getActiveTe(item: AsistenciaItem): TurnoExtraItem | undefined {
  return item.turnosExtra
    ?.filter((t) => t.status !== "rejected")
    .sort((a, b) => (TE_PRIORITY[a.status] ?? 9) - (TE_PRIORITY[b.status] ?? 9))[0];
}

export function getInitialStatus(item: AsistenciaItem): "pendiente" | "ppc" {
  return item.plannedGuardiaId ? "pendiente" : "ppc";
}

export function hasChanges(item: AsistenciaItem): boolean {
  const initialStatus = getInitialStatus(item);
  return item.attendanceStatus !== initialStatus || item.replacementGuardiaId != null;
}
