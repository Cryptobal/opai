import { type ModuleKey, type RolePermissions, canView, hasModuleAccess } from "@/lib/permissions";

export interface NotificationTypeDef {
  key: string;
  label: string;
  description: string;
  module: ModuleKey;
  submodule?: string;
  category: string;
  defaultBell: boolean;
  defaultEmail: boolean;
}

export const NOTIFICATION_TYPES: NotificationTypeDef[] = [
  // ── CRM - Leads (requiere crm.leads) ──
  {
    key: "new_lead",
    label: "Nuevo lead",
    description: "Cuando llega un nuevo lead desde formulario o email",
    module: "crm",
    submodule: "leads",
    category: "CRM - Leads",
    defaultBell: true,
    defaultEmail: false,
  },
  {
    key: "lead_approved",
    label: "Lead aprobado",
    description: "Cuando un lead es aprobado y pasa a prospecto",
    module: "crm",
    submodule: "leads",
    category: "CRM - Leads",
    defaultBell: true,
    defaultEmail: false,
  },
  {
    key: "prospect",
    label: "Nuevo prospecto",
    description: "Cuando se crea un nuevo prospecto",
    module: "crm",
    submodule: "leads",
    category: "CRM - Leads",
    defaultBell: true,
    defaultEmail: false,
  },

  // ── CRM - General (cualquier acceso CRM) ──
  {
    key: "mention",
    label: "Mención en nota (legacy)",
    description: "Compatibilidad con menciones antiguas",
    module: "crm",
    category: "CRM - General",
    defaultBell: true,
    defaultEmail: true,
  },
  {
    key: "mention_direct",
    label: "Mención directa en nota",
    description: "Cuando alguien te menciona directamente con @usuario",
    module: "crm",
    category: "CRM - Notas",
    defaultBell: true,
    defaultEmail: true,
  },
  {
    key: "mention_group",
    label: "Mención grupal en nota",
    description: "Cuando alguien menciona tu grupo o @Todos",
    module: "crm",
    category: "CRM - Notas",
    defaultBell: true,
    defaultEmail: true,
  },
  {
    key: "note_thread_reply",
    label: "Respuesta en hilo de nota",
    description: "Cuando responden en un hilo donde participas",
    module: "crm",
    category: "CRM - Notas",
    defaultBell: true,
    defaultEmail: true,
  },

  // ── CRM - Email / Follow-ups (requiere crm.deals) ──
  {
    key: "email_opened",
    label: "Email abierto",
    description: "Cuando un destinatario abre un email enviado",
    module: "crm",
    submodule: "deals",
    category: "CRM - Email",
    defaultBell: true,
    defaultEmail: false,
  },
  {
    key: "email_clicked",
    label: "Clic en email",
    description: "Cuando un destinatario hace clic en un link del email",
    module: "crm",
    submodule: "deals",
    category: "CRM - Email",
    defaultBell: true,
    defaultEmail: false,
  },
  {
    key: "email_bounced",
    label: "Email rebotado",
    description: "Cuando un email no se pudo entregar",
    module: "crm",
    submodule: "deals",
    category: "CRM - Email",
    defaultBell: true,
    defaultEmail: true,
  },
  {
    key: "followup_sent",
    label: "Follow-up enviado",
    description: "Cuando se envía un email de seguimiento automático",
    module: "crm",
    submodule: "deals",
    category: "CRM - Follow-ups",
    defaultBell: true,
    defaultEmail: true,
  },
  {
    key: "followup_scheduled",
    label: "Follow-up programado",
    description: "Cuando se programa un email de seguimiento",
    module: "crm",
    submodule: "deals",
    category: "CRM - Follow-ups",
    defaultBell: true,
    defaultEmail: false,
  },
  {
    key: "followup_failed",
    label: "Follow-up fallido",
    description: "Cuando falla el envío de un follow-up",
    module: "crm",
    submodule: "deals",
    category: "CRM - Follow-ups",
    defaultBell: true,
    defaultEmail: true,
  },

  // ── CPQ ──
  {
    key: "quote_sent",
    label: "Cotización enviada",
    description: "Cuando se envía una cotización a un cliente",
    module: "cpq",
    category: "CPQ - Cotizaciones",
    defaultBell: true,
    defaultEmail: false,
  },
  {
    key: "quote_viewed",
    label: "Cotización vista",
    description: "Cuando un cliente ve una cotización",
    module: "cpq",
    category: "CPQ - Cotizaciones",
    defaultBell: true,
    defaultEmail: false,
  },
  {
    key: "quote_approved_portal",
    label: "Propuesta aceptada (portal)",
    description: "Cuando un cliente acepta una propuesta desde el portal",
    module: "cpq",
    category: "CPQ - Cotizaciones",
    defaultBell: true,
    defaultEmail: true,
  },
  {
    key: "quote_rejected_portal",
    label: "Propuesta rechazada (portal)",
    description: "Cuando un cliente rechaza una propuesta desde el portal",
    module: "cpq",
    category: "CPQ - Cotizaciones",
    defaultBell: true,
    defaultEmail: true,
  },

  // ── Documentos ──
  {
    key: "contract_required",
    label: "Contrato requerido",
    description: "Cuando un negocio cerrado requiere contrato",
    module: "docs",
    category: "Documentos",
    defaultBell: true,
    defaultEmail: true,
  },
  {
    key: "contract_expiring",
    label: "Contrato por vencer",
    description: "Cuando un contrato está próximo a vencer",
    module: "docs",
    category: "Documentos",
    defaultBell: true,
    defaultEmail: true,
  },
  {
    key: "contract_expired",
    label: "Contrato vencido",
    description: "Cuando un contrato ha vencido",
    module: "docs",
    category: "Documentos",
    defaultBell: true,
    defaultEmail: true,
  },
  {
    key: "document_signed_completed",
    label: "Firma completada",
    description: "Cuando todos los firmantes completan un documento",
    module: "docs",
    category: "Documentos",
    defaultBell: true,
    defaultEmail: true,
  },

  // ── Operaciones - Guardias (requiere ops.guardias) ──
  {
    key: "guardia_doc_expiring",
    label: "Doc. guardia por vencer",
    description: "Cuando un documento de guardia está por vencer",
    module: "ops",
    submodule: "guardias",
    category: "Operaciones - Guardias",
    defaultBell: true,
    defaultEmail: false,
  },
  {
    key: "guardia_doc_expired",
    label: "Doc. guardia vencido",
    description: "Cuando un documento de guardia ha vencido",
    module: "ops",
    submodule: "guardias",
    category: "Operaciones - Guardias",
    defaultBell: true,
    defaultEmail: true,
  },
  {
    key: "new_postulacion",
    label: "Nueva postulación",
    description: "Cuando un guardia envía una postulación",
    module: "ops",
    submodule: "guardias",
    category: "Operaciones - Guardias",
    defaultBell: true,
    defaultEmail: false,
  },
  {
    key: "refuerzo_solicitud_created",
    label: "Nuevo turno de refuerzo",
    description: "Cuando se registra una nueva solicitud de turno de refuerzo",
    module: "ops",
    submodule: "turnos_extra",
    category: "Operaciones - Turnos",
    defaultBell: true,
    defaultEmail: true,
  },

  // ── Operaciones - Tickets (requiere ops.tickets) ──
  {
    key: "ticket_created",
    label: "Ticket creado (P1/P2)",
    description: "Cuando se crea un ticket de prioridad alta",
    module: "ops",
    submodule: "tickets",
    category: "Operaciones - Tickets",
    defaultBell: true,
    defaultEmail: true,
  },
  {
    key: "ticket_approved",
    label: "Ticket aprobado",
    description: "Cuando un ticket es aprobado en un paso de aprobación",
    module: "ops",
    submodule: "tickets",
    category: "Operaciones - Tickets",
    defaultBell: true,
    defaultEmail: false,
  },
  {
    key: "ticket_rejected",
    label: "Ticket rechazado",
    description: "Cuando un ticket es rechazado en un paso de aprobación",
    module: "ops",
    submodule: "tickets",
    category: "Operaciones - Tickets",
    defaultBell: true,
    defaultEmail: true,
  },
  {
    key: "ticket_sla_breached",
    label: "SLA incumplido",
    description: "Cuando un ticket excede su tiempo de SLA",
    module: "ops",
    submodule: "tickets",
    category: "Operaciones - Tickets",
    defaultBell: true,
    defaultEmail: true,
  },
  {
    key: "ticket_sla_approaching",
    label: "SLA próximo a vencer",
    description: "Cuando un ticket está por exceder su SLA",
    module: "ops",
    submodule: "tickets",
    category: "Operaciones - Tickets",
    defaultBell: true,
    defaultEmail: false,
  },
  {
    key: "ticket_mention",
    label: "Mención en ticket",
    description: "Cuando alguien te menciona en un comentario de ticket",
    module: "ops",
    submodule: "tickets",
    category: "Operaciones - Tickets",
    defaultBell: true,
    defaultEmail: true,
  },
  {
    key: "ticket_sla_breached_batch",
    label: "SLA vencido (lote)",
    description: "Cuando múltiples tickets del mismo equipo tienen SLA vencido",
    module: "ops",
    submodule: "tickets",
    category: "Operaciones - Tickets",
    defaultBell: true,
    defaultEmail: true,
  },
  {
    key: "ticket_sla_paused",
    label: "SLA pausado",
    description: "Cuando se pausa el SLA de un ticket",
    module: "ops",
    submodule: "tickets",
    category: "Operaciones - Tickets",
    defaultBell: true,
    defaultEmail: false,
  },
  {
    key: "ticket_sla_extended",
    label: "SLA extendido",
    description: "Cuando se aplaza el plazo de SLA de un ticket",
    module: "ops",
    submodule: "tickets",
    category: "Operaciones - Tickets",
    defaultBell: true,
    defaultEmail: false,
  },
  {
    key: "ticket_from_client_portal",
    label: "Ticket desde portal cliente",
    description: "Cuando un cliente crea o comenta en un ticket desde el portal",
    module: "ops",
    submodule: "tickets",
    category: "Operaciones - Tickets",
    defaultBell: true,
    defaultEmail: true,
  },
  {
    key: "ticket_new_email_reply",
    label: "Respuesta por email en ticket",
    description: "Cuando se recibe un email de respuesta en un ticket",
    module: "ops",
    submodule: "tickets",
    category: "Operaciones - Tickets",
    defaultBell: true,
    defaultEmail: true,
  },

  // ── CRM - Portal Cliente ──
  // ── Inventario ──
  {
    key: "inventory_delivery",
    label: "Entrega de inventario",
    description: "Cuando se registra una entrega de uniformes o equipamiento a un guardia",
    module: "ops",
    submodule: "inventario",
    category: "Operaciones - Inventario",
    defaultBell: true,
    defaultEmail: false,
  },

  // ── Operaciones - Alertas de Cobertura (requiere ops.alertas_cobertura) ──
  {
    key: "alerta_cobertura_nueva",
    label: "Nueva alerta de cobertura",
    description: "Cuando se crea una nueva alerta de cobertura y se notifican guardias",
    module: "ops",
    submodule: "alertas_cobertura",
    category: "Operaciones - Cobertura",
    defaultBell: true,
    defaultEmail: true,
  },
  {
    key: "alerta_cobertura_aceptada",
    label: "Alerta de cobertura aceptada",
    description: "Cuando un guardia acepta una alerta de cobertura",
    module: "ops",
    submodule: "alertas_cobertura",
    category: "Operaciones - Cobertura",
    defaultBell: true,
    defaultEmail: true,
  },
  {
    key: "alerta_cobertura_confirmar",
    label: "Confirmar asistencia de cobertura",
    description: "Solicitud para confirmar si el guardia se presentó al turno",
    module: "ops",
    submodule: "alertas_cobertura",
    category: "Operaciones - Cobertura",
    defaultBell: true,
    defaultEmail: false,
  },
  {
    key: "alerta_cobertura_expirada",
    label: "Alerta de cobertura expirada",
    description: "Cuando una alerta de cobertura expira sin ser aceptada",
    module: "ops",
    submodule: "alertas_cobertura",
    category: "Operaciones - Cobertura",
    defaultBell: true,
    defaultEmail: false,
  },

  // ── CRM - Portal Cliente ──
  {
    key: "portal_cliente_access_granted",
    label: "Acceso portal cliente",
    description: "Cuando se habilita el acceso al portal de un contacto de cliente",
    module: "crm",
    submodule: "accounts",
    category: "CRM - Portal Cliente",
    defaultBell: true,
    defaultEmail: false,
  },
  {
    key: "portal_cliente_access_revoked",
    label: "Acceso portal revocado",
    description: "Cuando se revoca el acceso al portal de un contacto de cliente",
    module: "crm",
    submodule: "accounts",
    category: "CRM - Portal Cliente",
    defaultBell: true,
    defaultEmail: false,
  },
];

export const NOTIFICATION_TYPE_MAP = new Map(
  NOTIFICATION_TYPES.map((t) => [t.key, t])
);

export const NOTIFICATION_TYPE_MODULE: Record<string, ModuleKey> = Object.fromEntries(
  NOTIFICATION_TYPES.map((t) => [t.key, t.module])
);

export const NOTIFICATION_CATEGORIES = [
  ...new Set(NOTIFICATION_TYPES.map((t) => t.category)),
];

/**
 * Verifica si un usuario con ciertos permisos puede ver un tipo de notificación.
 * Usa submódulo si está definido, sino verifica acceso al módulo.
 */
export function canSeeNotificationType(
  perms: RolePermissions,
  typeDef: NotificationTypeDef
): boolean {
  if (typeDef.submodule) {
    return canView(perms, typeDef.module, typeDef.submodule);
  }
  return hasModuleAccess(perms, typeDef.module);
}

export interface UserNotifPref {
  bell: boolean;
  email: boolean;
}

export type UserNotifPrefsMap = Record<string, UserNotifPref>;

export function getDefaultUserPrefs(): UserNotifPrefsMap {
  const prefs: UserNotifPrefsMap = {};
  for (const t of NOTIFICATION_TYPES) {
    prefs[t.key] = { bell: t.defaultBell, email: t.defaultEmail };
  }
  return prefs;
}
