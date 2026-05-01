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
  faceIdRegistered: boolean;
  lifecycleStatus: string;
  isPostulante: boolean;
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
  gpsStatus: string | null;
  lat: number | null;
  lng: number | null;
  metodoId: string | null;
  fotoEvidenciaUrl: string | null;
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
//  FEATURE FLAGS — PIN visibility migration (Ley 21.719 Fase 2)
// ═══════════════════════════════════════════════════════════════

/**
 * Controla si el PIN almacenado (`marcacionPinVisible`) se muestra en la ficha
 * del guardia. Habilitado para consulta operativa: los supervisores necesitan
 * poder ver y entregar el PIN cuando el guardia lo olvida.
 */
export const SHOW_PIN_IN_PROFILE = true;

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
  | "examenes"
  | "resultados"
  | "chat"
  | "control-acceso"
  | "desempeno"
  | "equipamiento"
  | "alertas-cobertura"
  | "mis-datos";

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
  { key: "alertas-cobertura", label: "Turnos Disponibles", icon: "Siren", description: "Ofertas de turno extra disponibles" },
  { key: "documentos", label: "Documentos", icon: "FileText", description: "Mis documentos" },
  { key: "perfil", label: "Perfil", icon: "User", description: "Mis datos personales" },
  { key: "protocolo", label: "Mi Protocolo", icon: "BookOpen", description: "Protocolo de la instalación" },
  { key: "examenes", label: "Exámenes", icon: "ClipboardCheck", description: "Evaluaciones pendientes" },
  { key: "resultados", label: "Mis Resultados", icon: "BarChart3", description: "Historial de resultados" },
  { key: "chat", label: "Chat", icon: "MessageCircle", description: "Chat de instalación" },
  { key: "equipamiento", label: "Equipamiento", icon: "Package", description: "Uniformes y equipos asignados" },
  { key: "control-acceso", label: "Control Acceso", icon: "ShieldCheck", description: "Control de acceso a la instalación" },
  { key: "desempeno", label: "Desempeño", icon: "TrendingUp", description: "Mi puntaje, badges y ranking" },
  { key: "mis-datos", label: "Mis Datos", icon: "Shield", description: "Tus datos personales y derechos ARCO (Ley 21.719)" },
];

// Bottom nav: only 5 items for mobile
export const PORTAL_BOTTOM_NAV: PortalSection[] = [
  "inicio",
  "desempeno",
  "solicitudes",
  "chat",
  "perfil",
];

// ═══════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════

export const SHIFT_CODE_LABELS: Record<string, { label: string; color: string }> = {
  T: { label: "Trabajo", color: "bg-status-info" },
  "-": { label: "Descanso", color: "bg-gray-300 dark:bg-gray-600" },
  V: { label: "Vacaciones", color: "bg-status-ok" },
  L: { label: "Licencia", color: "bg-status-warn" },
  P: { label: "Permiso", color: "bg-purple-500" },
  F: { label: "Feriado", color: "bg-pink-400" },
};

export const ATTENDANCE_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  present: { label: "Presente", color: "text-status-ok-fg" },
  absent: { label: "Ausente", color: "text-status-danger-fg" },
  late: { label: "Atraso", color: "text-status-warn-fg" },
  rest: { label: "Descanso", color: "text-gray-400" },
  vacation: { label: "Vacaciones", color: "text-status-ok-fg" },
  license: { label: "Licencia", color: "text-status-warn-fg" },
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
