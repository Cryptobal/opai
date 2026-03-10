export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message?: string | null;
  data?: Record<string, unknown>;
  read: boolean;
  link?: string | null;
  createdAt: string;
  sourceModule?: string;
  source_module?: string;
  sourceModuleLabel?: string;
  source_module_label?: string;
  sourceRecordName?: string | null;
  source_record_name?: string | null;
  isSystem?: boolean;
  is_system?: boolean;
}

export const TYPE_ICONS: Record<string, string> = {
  new_lead: "🔔",
  lead_approved: "✅",
  quote_sent: "📧",
  quote_viewed: "👁️",
  contract_required: "📝",
  contract_expiring: "⚠️",
  contract_expired: "🔴",
  guardia_doc_expiring: "🟠",
  guardia_doc_expired: "🔴",
  new_postulacion: "📋",
  document_signed_completed: "✅",
  email_opened: "👀",
  email_clicked: "🖱️",
  email_bounced: "⚠️",
  followup_sent: "📨",
  followup_scheduled: "⏰",
  followup_failed: "❌",
  mention: "💬",
  mention_direct: "📌",
  mention_group: "👥",
  note_thread_reply: "🧵",
  ticket_created: "🎫",
  ticket_approved: "✅",
  ticket_rejected: "❌",
  ticket_sla_breached: "🚨",
  ticket_sla_approaching: "⏳",
  refuerzo_solicitud_created: "📋",
};

export const TYPE_LABELS: Record<string, string> = {
  mention: "Mención",
  mention_direct: "Mención directa",
  mention_group: "Mención grupal",
  note_thread_reply: "Respuesta en hilo",
};

export const NON_SYSTEM_TYPES = new Set([
  "mention",
  "ticket_mention",
]);

export const TYPE_MODULE_FALLBACK: Record<string, string> = {
  new_lead: "lead",
  lead_approved: "lead",
  mention: "crm",
  email_opened: "negocio",
  email_clicked: "negocio",
  email_bounced: "negocio",
  followup_sent: "negocio",
  followup_scheduled: "negocio",
  followup_failed: "negocio",
  quote_sent: "cotizacion",
  quote_viewed: "cotizacion",
  contract_required: "contrato",
  contract_expiring: "contrato",
  contract_expired: "contrato",
  document_signed_completed: "contrato",
  guardia_doc_expiring: "guardia",
  guardia_doc_expired: "guardia",
  new_postulacion: "guardia",
  refuerzo_solicitud_created: "operaciones",
  ticket_created: "operaciones",
  ticket_approved: "operaciones",
  ticket_rejected: "operaciones",
  ticket_sla_breached: "operaciones",
  ticket_sla_approaching: "operaciones",
  ticket_mention: "operaciones",
};

export const MODULE_LABELS: Record<string, string> = {
  lead: "Lead",
  negocio: "Negocio",
  cotizacion: "Cotización",
  contrato: "Contrato",
  operaciones: "Operaciones",
  guardia: "Guardia",
  cuenta: "Cuenta",
  contacto: "Contacto",
  instalacion: "Instalación",
  documentos: "Documentos",
  crm: "CRM",
  finanzas: "Finanzas",
  payroll: "Payroll",
  configuracion: "Configuración",
  hub: "Hub",
  sistema: "Sistema",
};

export const MODULE_BADGE_STYLES: Record<string, string> = {
  lead: "border-sky-400/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  negocio: "border-emerald-400/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  cotizacion: "border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300",
  contrato: "border-amber-400/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  operaciones: "border-indigo-400/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  guardia: "border-orange-400/40 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  cuenta: "border-cyan-400/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  contacto: "border-violet-400/40 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  instalacion: "border-teal-400/40 bg-teal-500/10 text-teal-700 dark:text-teal-300",
  documentos: "border-yellow-400/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300",
  crm: "border-blue-400/40 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  finanzas: "border-lime-400/40 bg-lime-500/10 text-lime-700 dark:text-lime-300",
  payroll: "border-rose-400/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  configuracion: "border-slate-400/40 bg-slate-500/10 text-slate-700 dark:text-slate-300",
  hub: "border-purple-400/40 bg-purple-500/10 text-purple-700 dark:text-purple-300",
  sistema: "border-zinc-400/40 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300",
};

export const MODULE_SORT_ORDER = [
  "lead",
  "negocio",
  "cotizacion",
  "contrato",
  "operaciones",
  "guardia",
  "cuenta",
  "contacto",
  "instalacion",
  "crm",
  "documentos",
  "finanzas",
  "payroll",
  "configuracion",
  "hub",
  "sistema",
];

export function timeAgo(dateStr: string): string {
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `hace ${days}d`;
  return new Date(dateStr).toLocaleDateString("es-CL", {
    day: "numeric",
    month: "short",
  });
}

export function formatExactDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeModuleKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function inferModuleFromType(type: string): string {
  return TYPE_MODULE_FALLBACK[type] || "sistema";
}

export function getModuleMeta(notification: NotificationItem) {
  const key =
    normalizeModuleKey(notification.sourceModule) ||
    normalizeModuleKey(notification.source_module) ||
    inferModuleFromType(notification.type);
  const label =
    notification.sourceModuleLabel ||
    notification.source_module_label ||
    MODULE_LABELS[key] ||
    "Sistema";

  return {
    key,
    label,
    badgeClass: MODULE_BADGE_STYLES[key] || MODULE_BADGE_STYLES.sistema,
  };
}

export function getRecordName(notification: NotificationItem): string | null {
  const sourceRecord =
    notification.sourceRecordName ||
    notification.source_record_name ||
    null;
  if (sourceRecord) return sourceRecord;
  const data = (notification.data || {}) as Record<string, unknown>;
  const accountName = data.accountName;
  if (typeof accountName === "string" && accountName.trim()) return accountName.trim();
  const company = data.company;
  if (typeof company === "string" && company.trim()) return company.trim();
  const dealTitle = data.dealTitle;
  if (typeof dealTitle === "string" && dealTitle.trim()) return dealTitle.trim();
  return null;
}

export function getContextLabel(notification: NotificationItem): string {
  const moduleMeta = getModuleMeta(notification);
  const recordName = getRecordName(notification);
  return recordName ? `${moduleMeta.label}: ${recordName}` : moduleMeta.label;
}

export function isSystemNotification(notification: NotificationItem): boolean {
  if (typeof notification.isSystem === "boolean") return notification.isSystem;
  if (typeof notification.is_system === "boolean") return notification.is_system;
  return !NON_SYSTEM_TYPES.has(notification.type);
}
