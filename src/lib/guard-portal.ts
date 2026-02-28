/**
 * Guard Portal — Types, constants, and helpers for the guard self-service portal.
 *
 * Guards authenticate via RUT + PIN (same as marcación).
 * Session is stored client-side and scoped to read-only access of their own data.
 */

// ═══════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════

export interface GuardSession {
  guardiaId: string;
  personaId: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  rut: string;
  code: string | null;
  currentInstallationId: string | null;
  currentInstallationName: string | null;
  authenticatedAt: string;
}

export interface GuardScheduleDay {
  date: string; // ISO date
  shiftCode: string; // T, -, V, L, P, etc.
  shiftLabel: string;
  installationName: string | null;
  turno: string | null; // "07:00-19:00"
}

export interface GuardAttendanceRecord {
  date: string;
  status: "present" | "absent" | "late" | "rest" | "vacation" | "license" | "permission";
  statusLabel: string;
  entryTime: string | null;
  exitTime: string | null;
  installationName: string | null;
}

export interface GuardMarcacion {
  id: string;
  type: "entrada" | "salida";
  timestamp: string;
  installationName: string;
  geoValidated: boolean;
  geoDistanceM: number | null;
}

export interface GuardExtraShift {
  id: string;
  date: string;
  installationName: string;
  hours: number;
  amountClp: number;
  status: "pending" | "approved" | "rejected" | "paid";
  statusLabel: string;
}

export interface GuardDocument {
  id: string;
  title: string;
  type: string;
  createdAt: string;
  url: string | null;
}

export interface GuardTicket {
  id: string;
  code: string;
  title: string;
  typeName: string;
  status: string;
  statusLabel: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
}

// ═══════════════════════════════════════════════════════════════
//  PORTAL SECTIONS
// ═══════════════════════════════════════════════════════════════

export type PortalSection =
  | "inicio"
  | "solicitudes"
  | "pauta"
  | "asistencia"
  | "marcaciones"
  | "turnos-extra"
  | "documentos"
  | "perfil"
  | "protocolo"
  | "examen"
  | "resultados";

export interface PortalNavItem {
  key: PortalSection;
  label: string;
  icon: string; // lucide icon name
  description: string;
}

export const PORTAL_NAV_ITEMS: PortalNavItem[] = [
  { key: "inicio", label: "Inicio", icon: "Home", description: "Resumen general" },
  { key: "solicitudes", label: "Solicitudes", icon: "Ticket", description: "Mis solicitudes y tickets" },
  { key: "pauta", label: "Mi Pauta", icon: "CalendarDays", description: "Calendario de turnos" },
  { key: "asistencia", label: "Asistencia", icon: "UserCheck", description: "Registro de asistencia" },
  { key: "marcaciones", label: "Marcaciones", icon: "Fingerprint", description: "Historial de check-in/out" },
  { key: "turnos-extra", label: "Turnos Extra", icon: "Clock", description: "Horas extra y pagos" },
  { key: "documentos", label: "Documentos", icon: "FileText", description: "Mis documentos" },
  { key: "perfil", label: "Perfil", icon: "User", description: "Mis datos personales" },
  { key: "protocolo", label: "Mi Protocolo", icon: "ClipboardList", description: "Protocolo de mi instalación" },
  { key: "examen", label: "Examen", icon: "FileEdit", description: "Responder examen" },
  { key: "resultados", label: "Mis Resultados", icon: "BarChart3", description: "Historial de exámenes" },
];

// Bottom nav: only 4 items for mobile
export const PORTAL_BOTTOM_NAV: PortalSection[] = [
  "inicio",
  "solicitudes",
  "pauta",
  "perfil",
];

// ═══════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════

export const SHIFT_CODE_LABELS: Record<string, { label: string; color: string }> = {
  T: { label: "Trabajo", color: "bg-blue-500" },
  "-": { label: "Descanso", color: "bg-gray-300 dark:bg-gray-600" },
  V: { label: "Vacaciones", color: "bg-emerald-500" },
  L: { label: "Licencia", color: "bg-amber-500" },
  P: { label: "Permiso", color: "bg-purple-500" },
  F: { label: "Feriado", color: "bg-pink-400" },
};

export const ATTENDANCE_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  present: { label: "Presente", color: "text-emerald-600" },
  absent: { label: "Ausente", color: "text-red-500" },
  late: { label: "Atraso", color: "text-amber-500" },
  rest: { label: "Descanso", color: "text-gray-400" },
  vacation: { label: "Vacaciones", color: "text-emerald-500" },
  license: { label: "Licencia", color: "text-amber-600" },
  permission: { label: "Permiso", color: "text-purple-500" },
};

export const EXTRA_SHIFT_STATUS_LABELS: Record<string, { label: string; variant: string }> = {
  pending: { label: "Pendiente", variant: "secondary" },
  approved: { label: "Aprobado", variant: "success" },
  rejected: { label: "Rechazado", variant: "destructive" },
  paid: { label: "Pagado", variant: "default" },
};

// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════

/** Format RUT with auto-dash */
export function formatRut(value: string): string {
  const clean = value.replace(/[^0-9kK]/g, "").toUpperCase();
  if (clean.length <= 1) return clean;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  return `${body}-${dv}`;
}

/** Validate Chilean RUT (basic check) */
export function isValidRut(rut: string): boolean {
  const clean = rut.replace(/[.-]/g, "");
  if (clean.length < 7 || clean.length > 9) return false;
  return /^\d{6,8}[0-9kK]$/.test(clean);
}

/** Get greeting based on time of day */
export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

/** Format currency CLP */
export function formatClp(amount: number): string {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(amount);
}
