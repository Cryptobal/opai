import { type ModuleKey } from "@/lib/permissions";

export type Audience = 'admin' | 'guardia' | 'cliente' | 'rondas';

export type NotifModule = ModuleKey | 'chat';

export interface NotificationChannelDefaults {
  bell?: boolean;
  email?: boolean;
  push?: boolean;
}

export interface CoalescePolicy {
  windowSeconds: number;
  groupBy: 'tenant' | 'module' | 'submodule' | 'entity';
}

export interface UnifiedNotificationType {
  key: string;
  label: string;
  description: string;
  module: NotifModule;
  submodule?: string;
  category: string;
  audiences: Audience[];
  defaults: Partial<Record<Audience, NotificationChannelDefaults>>;
  coalesce?: CoalescePolicy;
  critical?: boolean;
  /** Legacy keys that resolve to this canonical entry. */
  aliases?: string[];
}

const adminBell = (email = false): NotificationChannelDefaults => ({ bell: true, email, push: true });

export const UNIFIED_NOTIFICATION_TYPES: UnifiedNotificationType[] = [
  // ── CRM - Leads ──
  {
    key: 'new_lead', label: 'Nuevo lead',
    description: 'Cuando llega un nuevo lead desde formulario o email',
    module: 'crm', submodule: 'leads', category: 'CRM - Leads',
    audiences: ['admin'], defaults: { admin: adminBell() },
    coalesce: { windowSeconds: 300, groupBy: 'tenant' },
    aliases: ['lead_new'],
  },
  {
    key: 'lead_approved', label: 'Lead aprobado',
    description: 'Cuando un lead es aprobado y pasa a prospecto',
    module: 'crm', submodule: 'leads', category: 'CRM - Leads',
    audiences: ['admin'], defaults: { admin: adminBell() },
  },
  {
    key: 'prospect', label: 'Nuevo prospecto',
    description: 'Cuando se crea un nuevo prospecto',
    module: 'crm', submodule: 'leads', category: 'CRM - Leads',
    audiences: ['admin'], defaults: { admin: adminBell() },
  },
  {
    key: 'lead_escalation', label: 'Lead sin contactar',
    description: 'Lead lleva > 30 min sin contacto en horario hábil',
    module: 'crm', submodule: 'leads', category: 'CRM - Leads',
    audiences: ['admin'], defaults: { admin: adminBell() },
  },
  {
    key: 'lead_assigned', label: 'Lead asignado',
    description: 'Cuando se te asigna un lead para seguimiento',
    module: 'crm', submodule: 'leads', category: 'CRM - Leads',
    audiences: ['admin'], defaults: { admin: adminBell(true) },
  },

  // ── CRM - Notas ──
  {
    key: 'mention', label: 'Mención en nota (legacy)',
    description: 'Compatibilidad con menciones antiguas',
    module: 'crm', category: 'CRM - General',
    audiences: ['admin'], defaults: { admin: adminBell(true) },
  },
  {
    key: 'mention_direct', label: 'Mención directa en nota',
    description: 'Cuando alguien te menciona directamente con @usuario',
    module: 'crm', category: 'CRM - Notas',
    audiences: ['admin'], defaults: { admin: adminBell(true) },
  },
  {
    key: 'mention_group', label: 'Mención grupal en nota',
    description: 'Cuando alguien menciona tu grupo o @Todos',
    module: 'crm', category: 'CRM - Notas',
    audiences: ['admin'], defaults: { admin: adminBell(true) },
  },
  {
    key: 'note_thread_reply', label: 'Respuesta en hilo de nota',
    description: 'Cuando responden en un hilo donde participas',
    module: 'crm', category: 'CRM - Notas',
    audiences: ['admin'], defaults: { admin: adminBell(true) },
  },

  // ── CRM - Email / Follow-ups ──
  {
    key: 'email_opened', label: 'Email abierto',
    description: 'Cuando un destinatario abre un email enviado',
    module: 'crm', submodule: 'deals', category: 'CRM - Email',
    audiences: ['admin'], defaults: { admin: { bell: true, email: false, push: false } },
  },
  {
    key: 'email_clicked', label: 'Clic en email',
    description: 'Cuando un destinatario hace clic en un link del email',
    module: 'crm', submodule: 'deals', category: 'CRM - Email',
    audiences: ['admin'], defaults: { admin: { bell: true, email: false, push: false } },
  },
  {
    key: 'email_bounced', label: 'Email rebotado',
    description: 'Cuando un email no se pudo entregar',
    module: 'crm', submodule: 'deals', category: 'CRM - Email',
    audiences: ['admin'], defaults: { admin: adminBell(true) },
  },
  {
    key: 'followup_sent', label: 'Follow-up enviado',
    description: 'Cuando se envía un email de seguimiento automático',
    module: 'crm', submodule: 'deals', category: 'CRM - Follow-ups',
    audiences: ['admin'], defaults: { admin: { bell: true, email: true, push: false } },
  },
  {
    key: 'followup_scheduled', label: 'Follow-up programado',
    description: 'Cuando se programa un email de seguimiento',
    module: 'crm', submodule: 'deals', category: 'CRM - Follow-ups',
    audiences: ['admin'], defaults: { admin: { bell: true, email: false, push: false } },
  },
  {
    key: 'followup_failed', label: 'Follow-up fallido',
    description: 'Cuando falla el envío de un follow-up',
    module: 'crm', submodule: 'deals', category: 'CRM - Follow-ups',
    audiences: ['admin'], defaults: { admin: adminBell(true) },
  },

  // ── CPQ ──
  {
    key: 'quote_sent', label: 'Cotización enviada',
    description: 'Cuando se envía una cotización a un cliente',
    module: 'cpq', category: 'CPQ - Cotizaciones',
    audiences: ['admin'], defaults: { admin: adminBell() },
  },
  {
    key: 'quote_viewed', label: 'Cotización vista',
    description: 'Cuando un cliente ve una cotización',
    module: 'cpq', category: 'CPQ - Cotizaciones',
    audiences: ['admin'], defaults: { admin: adminBell() },
  },
  {
    key: 'quote_accepted', label: 'Cotización aceptada',
    description: 'Cuando un cliente acepta una cotización',
    module: 'cpq', category: 'CPQ - Cotizaciones',
    audiences: ['admin'], defaults: { admin: adminBell(true) },
    aliases: ['quote_approved_portal'],
  },
  {
    key: 'quote_rejected', label: 'Cotización rechazada',
    description: 'Cuando un cliente rechaza una cotización',
    module: 'cpq', category: 'CPQ - Cotizaciones',
    audiences: ['admin'], defaults: { admin: adminBell(true) },
    aliases: ['quote_rejected_portal'],
  },

  // ── Documentos ──
  {
    key: 'contract_required', label: 'Contrato requerido',
    description: 'Cuando un negocio cerrado requiere contrato',
    module: 'docs', category: 'Documentos',
    audiences: ['admin'], defaults: { admin: adminBell(true) },
  },
  {
    key: 'contract_expiring', label: 'Contrato por vencer',
    description: 'Cuando un contrato está próximo a vencer',
    module: 'docs', category: 'Documentos',
    audiences: ['admin'], defaults: { admin: adminBell(true) },
  },
  {
    key: 'contract_expired', label: 'Contrato vencido',
    description: 'Cuando un contrato ha vencido',
    module: 'docs', category: 'Documentos',
    audiences: ['admin'], defaults: { admin: adminBell(true) },
  },
  {
    key: 'contract_adjustment_reminder', label: 'Reajuste de contrato',
    description: 'Recordatorio de reajuste periódico (IPC/IMO/polinomio) por vencer',
    module: 'docs', category: 'Documentos',
    audiences: ['admin'], defaults: { admin: adminBell(true) },
  },
  {
    key: 'contract_suggestion', label: 'Sugerencia de edición de contrato',
    description: 'Cuando un cliente sugiere cambios en una cláusula desde el portal',
    module: 'docs', category: 'Documentos',
    audiences: ['admin'], defaults: { admin: adminBell(true) },
  },
  {
    key: 'document_signed', label: 'Documento firmado',
    description: 'Cuando todos los firmantes completan un documento',
    module: 'docs', category: 'Documentos',
    audiences: ['admin'], defaults: { admin: adminBell() },
    aliases: ['document_signed_completed'],
  },
  {
    key: 'document_expiring', label: 'Documento por vencer',
    description: 'Cuando un documento genérico está próximo a vencer',
    module: 'docs', category: 'Documentos',
    audiences: ['admin'], defaults: { admin: adminBell(true) },
  },
  {
    key: 'document_rejected', label: 'Documento rechazado',
    description: 'Cuando un cliente rechaza un documento enviado',
    module: 'docs', category: 'Documentos',
    audiences: ['admin'], defaults: { admin: adminBell(true) },
  },
  {
    key: 'document_available', label: 'Documento disponible',
    description: 'Cuando hay un nuevo documento para revisar o firmar',
    module: 'docs', category: 'Documentos',
    audiences: ['cliente'], defaults: { cliente: { push: true, email: true } },
  },
  {
    key: 'document_to_sign', label: 'Documento para firmar',
    description: 'Cuando hay un nuevo documento que requiere tu firma',
    module: 'docs', category: 'Documentos',
    audiences: ['guardia'], defaults: { guardia: { push: true, email: true } },
  },

  // ── Operaciones - Documentos operacionales ──
  {
    key: 'doc_operacional_expiring', label: 'Doc. operacional por vencer',
    description: 'OS10, Seguro, RIOHS, etc., próximos a vencer',
    module: 'ops', category: 'Operaciones - Documentos',
    audiences: ['admin'], defaults: { admin: adminBell(true) },
  },
  {
    key: 'doc_operacional_expired', label: 'Doc. operacional vencido',
    description: 'OS10, Seguro, RIOHS, etc., vencidos',
    module: 'ops', category: 'Operaciones - Documentos',
    audiences: ['admin'], defaults: { admin: adminBell(true) },
  },

  // ── Operaciones - Guardias ──
  {
    key: 'guardia_doc_expiring', label: 'Doc. guardia por vencer',
    description: 'Cuando un documento de guardia está por vencer',
    module: 'ops', submodule: 'guardias', category: 'Operaciones - Guardias',
    audiences: ['admin'], defaults: { admin: adminBell() },
  },
  {
    key: 'guardia_doc_expired', label: 'Doc. guardia vencido',
    description: 'Cuando un documento de guardia ha vencido',
    module: 'ops', submodule: 'guardias', category: 'Operaciones - Guardias',
    audiences: ['admin'], defaults: { admin: adminBell(true) },
  },
  {
    key: 'new_postulacion', label: 'Nueva postulación',
    description: 'Cuando un guardia envía una postulación',
    module: 'ops', submodule: 'guardias', category: 'Operaciones - Guardias',
    audiences: ['admin'], defaults: { admin: adminBell() },
  },
  {
    key: 'new_te_ingreso', label: 'Nuevo ingreso Turno Extra',
    description: 'Cuando un guardia completa el formulario de ingreso para Turno Extra',
    module: 'ops', submodule: 'guardias', category: 'Operaciones - Guardias',
    audiences: ['admin'], defaults: { admin: adminBell() },
  },
  {
    key: 'guard_no_checkin', label: 'Guardia sin check-in',
    description: 'Cuando un guardia no registra su entrada al turno',
    module: 'ops', submodule: 'guardias', category: 'Operaciones - Guardias',
    audiences: ['admin'], defaults: { admin: adminBell(true) },
  },
  {
    key: 'shift_reminder', label: 'Recordatorio de turno',
    description: 'Recordatorio antes del inicio de tu turno',
    module: 'ops', submodule: 'guardias', category: 'Operaciones - Guardias',
    audiences: ['guardia'], defaults: { guardia: { push: true, email: false } },
  },
  {
    key: 'schedule_change', label: 'Cambio de horario',
    description: 'Cuando tu horario o asignación de instalación cambia',
    module: 'ops', submodule: 'guardias', category: 'Operaciones - Guardias',
    audiences: ['guardia'], defaults: { guardia: { push: true, email: true } },
  },

  // ── Operaciones - Turnos extra / Refuerzos ──
  {
    key: 'refuerzo_solicitud_created', label: 'Nuevo turno de refuerzo',
    description: 'Cuando se registra una nueva solicitud de turno de refuerzo',
    module: 'ops', submodule: 'turnos_extra', category: 'Operaciones - Turnos',
    audiences: ['admin'], defaults: { admin: adminBell(true) },
  },

  // ── Operaciones - Tickets ──
  {
    key: 'ticket_created', label: 'Ticket creado',
    description: 'Cuando se crea un ticket (admin) o un cliente/guardia lo crea desde su portal',
    module: 'ops', submodule: 'tickets', category: 'Operaciones - Tickets',
    audiences: ['admin', 'cliente', 'guardia'],
    defaults: {
      admin: adminBell(true),
      cliente: { push: true, email: true },
      guardia: { push: true, email: false },
    },
  },
  {
    key: 'ticket_updated', label: 'Ticket actualizado',
    description: 'Cuando un ticket cambia de estado',
    module: 'ops', submodule: 'tickets', category: 'Operaciones - Tickets',
    audiences: ['cliente', 'guardia'],
    defaults: {
      cliente: { push: true, email: false },
      guardia: { push: true, email: false },
    },
  },
  {
    key: 'ticket_needs_approval', label: 'Ticket pendiente de aprobación',
    description: 'Cuando un ticket llega a tu grupo de aprobación',
    module: 'ops', submodule: 'tickets', category: 'Operaciones - Tickets',
    audiences: ['admin'], defaults: { admin: adminBell(true) },
  },
  {
    key: 'ticket_approved', label: 'Ticket aprobado',
    description: 'Cuando un ticket es aprobado en un paso de aprobación',
    module: 'ops', submodule: 'tickets', category: 'Operaciones - Tickets',
    audiences: ['admin'], defaults: { admin: adminBell() },
  },
  {
    key: 'ticket_rejected', label: 'Ticket rechazado',
    description: 'Cuando un ticket es rechazado en un paso de aprobación',
    module: 'ops', submodule: 'tickets', category: 'Operaciones - Tickets',
    audiences: ['admin'], defaults: { admin: adminBell(true) },
  },
  {
    key: 'ticket_sla_breached', label: 'SLA incumplido',
    description: 'Cuando un ticket excede su tiempo de SLA',
    module: 'ops', submodule: 'tickets', category: 'Operaciones - Tickets',
    audiences: ['admin'], defaults: { admin: { bell: true, email: false, push: true } },
  },
  {
    key: 'ticket_sla_approaching', label: 'SLA próximo a vencer',
    description: 'Cuando un ticket está por exceder su SLA',
    module: 'ops', submodule: 'tickets', category: 'Operaciones - Tickets',
    audiences: ['admin'], defaults: { admin: { bell: true, email: false, push: true } },
  },
  {
    key: 'ticket_mention', label: 'Mención en ticket',
    description: 'Cuando alguien te menciona en un comentario de ticket',
    module: 'ops', submodule: 'tickets', category: 'Operaciones - Tickets',
    audiences: ['admin'], defaults: { admin: adminBell(true) },
  },
  {
    key: 'ticket_sla_breached_batch', label: 'Resumen diario SLA vencido',
    description: 'Email diario consolidado de tickets con SLA vencido por equipo',
    module: 'ops', submodule: 'tickets', category: 'Operaciones - Tickets',
    audiences: ['admin'], defaults: { admin: { bell: false, email: true, push: false } },
  },
  {
    key: 'ticket_sla_paused', label: 'SLA pausado',
    description: 'Cuando se pausa el SLA de un ticket',
    module: 'ops', submodule: 'tickets', category: 'Operaciones - Tickets',
    audiences: ['admin'], defaults: { admin: { bell: true, email: false, push: false } },
  },
  {
    key: 'ticket_sla_extended', label: 'SLA extendido',
    description: 'Cuando se aplaza el plazo de SLA de un ticket',
    module: 'ops', submodule: 'tickets', category: 'Operaciones - Tickets',
    audiences: ['admin'], defaults: { admin: { bell: true, email: false, push: false } },
  },
  {
    key: 'ticket_from_client_portal', label: 'Ticket desde portal cliente',
    description: 'Cuando un cliente crea o comenta en un ticket desde el portal',
    module: 'ops', submodule: 'tickets', category: 'Operaciones - Tickets',
    audiences: ['admin'], defaults: { admin: adminBell(true) },
  },
  {
    key: 'ticket_new_email_reply', label: 'Respuesta por email en ticket',
    description: 'Cuando se recibe un email de respuesta en un ticket',
    module: 'ops', submodule: 'tickets', category: 'Operaciones - Tickets',
    audiences: ['admin'], defaults: { admin: adminBell(true) },
  },
  {
    key: 'ticket_assigned', label: 'Ticket asignado a ti',
    description: 'Cuando alguien te asigna como responsable de un ticket',
    module: 'ops', submodule: 'tickets', category: 'Operaciones - Tickets',
    audiences: ['admin'], defaults: { admin: adminBell(true) },
  },
  {
    key: 'ticket_assigned_guard', label: 'Ticket asignado',
    description: 'Cuando se te asigna un ticket para gestionar',
    module: 'ops', submodule: 'tickets', category: 'Operaciones - Tickets',
    audiences: ['guardia'], defaults: { guardia: { push: true, email: false } },
  },

  // ── Inventario ──
  {
    key: 'inventory_delivery', label: 'Entrega de inventario',
    description: 'Cuando se entrega uniformes o equipamiento a un guardia',
    module: 'ops', submodule: 'inventario', category: 'Operaciones - Inventario',
    audiences: ['admin', 'guardia'],
    defaults: {
      admin: adminBell(),
      guardia: { push: true, email: false },
    },
  },

  // ── Operaciones - Alertas de Cobertura ──
  {
    key: 'alerta_cobertura_nueva', label: 'Nueva alerta de cobertura',
    description: 'Cuando se crea una nueva alerta de cobertura y se notifican guardias',
    module: 'ops', submodule: 'alertas_cobertura', category: 'Operaciones - Cobertura',
    audiences: ['admin', 'guardia'],
    defaults: {
      admin: adminBell(true),
      guardia: { push: true, email: true },
    },
    critical: true,
    aliases: ['alerta_cobertura'],
  },
  {
    key: 'alerta_cobertura_aceptada', label: 'Alerta de cobertura aceptada',
    description: 'Cuando un guardia acepta una alerta de cobertura',
    module: 'ops', submodule: 'alertas_cobertura', category: 'Operaciones - Cobertura',
    audiences: ['admin'], defaults: { admin: adminBell(true) },
  },
  {
    key: 'alerta_cobertura_confirmar', label: 'Confirmar asistencia de cobertura',
    description: 'Solicitud para confirmar si el guardia se presentó al turno',
    module: 'ops', submodule: 'alertas_cobertura', category: 'Operaciones - Cobertura',
    audiences: ['admin'], defaults: { admin: adminBell() },
  },
  {
    key: 'alerta_cobertura_confirmada', label: 'Turno extra confirmado',
    description: 'Para el guardia: su turno extra fue confirmado por el supervisor',
    module: 'ops', submodule: 'alertas_cobertura', category: 'Operaciones - Cobertura',
    audiences: ['guardia'],
    defaults: { guardia: { push: true, email: true } },
  },
  {
    key: 'alerta_cobertura_expirada', label: 'Alerta de cobertura expirada',
    description: 'Cuando una alerta de cobertura expira sin ser aceptada',
    module: 'ops', submodule: 'alertas_cobertura', category: 'Operaciones - Cobertura',
    audiences: ['admin'], defaults: { admin: adminBell() },
  },

  // ── Rondas ──
  {
    key: 'ronda_alert_admin', label: 'Alerta de ronda (admin)',
    description: 'Cuando se detecta un incidente o problema en una ronda',
    module: 'ops', submodule: 'rondas', category: 'Operaciones - Rondas',
    audiences: ['admin'], defaults: { admin: adminBell(true) },
  },
  {
    key: 'ronda_overdue_admin', label: 'Ronda atrasada (admin)',
    description: 'Cuando una ronda no se inicia a tiempo',
    module: 'ops', submodule: 'rondas', category: 'Operaciones - Rondas',
    audiences: ['admin'], defaults: { admin: adminBell() },
  },
  {
    key: 'ronda_completed', label: 'Ronda completada',
    description: 'Cuando una ronda de vigilancia se completa en tu instalación',
    module: 'ops', submodule: 'rondas', category: 'Operaciones - Rondas',
    audiences: ['cliente'], defaults: { cliente: { push: true, email: false } },
  },
  {
    key: 'ronda_alert', label: 'Alerta de ronda',
    description: 'Cuando hay un incidente o problema en una ronda de tu instalación',
    module: 'ops', submodule: 'rondas', category: 'Operaciones - Rondas',
    audiences: ['cliente'], defaults: { cliente: { push: true, email: true } },
  },
  {
    key: 'ronda_assigned', label: 'Ronda asignada',
    description: 'Cuando se te asigna una nueva ronda para ejecutar',
    module: 'ops', submodule: 'rondas', category: 'Operaciones - Rondas',
    audiences: ['rondas'], defaults: { rondas: { push: true, email: false } },
  },
  {
    key: 'ronda_overdue', label: 'Ronda atrasada',
    description: 'Cuando una ronda asignada no se ha iniciado a tiempo',
    module: 'ops', submodule: 'rondas', category: 'Operaciones - Rondas',
    audiences: ['rondas'], defaults: { rondas: { push: true, email: true } },
  },
  {
    key: 'checkpoint_missed', label: 'Checkpoint no escaneado',
    description: 'Cuando un checkpoint no fue escaneado en el tiempo esperado',
    module: 'ops', submodule: 'rondas', category: 'Operaciones - Rondas',
    audiences: ['rondas'], defaults: { rondas: { push: true, email: false } },
  },
  {
    key: 'ronda_cancelled', label: 'Ronda cancelada',
    description: 'Cuando una ronda asignada es cancelada',
    module: 'ops', submodule: 'rondas', category: 'Operaciones - Rondas',
    audiences: ['rondas'], defaults: { rondas: { push: true, email: false } },
  },

  // ── Supervisión / Gastos / Payroll ──
  {
    key: 'supervision_visit_due', label: 'Visita de supervisión pendiente',
    description: 'Cuando tienes una visita de supervisión programada próxima',
    module: 'ops', submodule: 'supervision', category: 'Operaciones - Supervisión',
    audiences: ['admin'], defaults: { admin: adminBell() },
  },
  {
    key: 'expense_report_submitted', label: 'Rendición de gastos enviada',
    description: 'Cuando un supervisor envía una rendición de gastos para revisión',
    module: 'finance', category: 'Finanzas - Rendiciones',
    audiences: ['admin'], defaults: { admin: adminBell() },
  },
  {
    key: 'payroll_processed', label: 'Liquidación procesada',
    description: 'Cuando se procesan las liquidaciones de sueldo del período',
    module: 'payroll', category: 'Payroll',
    audiences: ['admin'], defaults: { admin: { bell: false, email: true, push: false } },
  },
  {
    key: 'invoice_due', label: 'Factura próxima a vencer',
    description: 'Recordatorio de factura o pago próximo a su fecha límite',
    module: 'finance', category: 'Finanzas - Facturación',
    audiences: ['cliente'], defaults: { cliente: { push: false, email: true } },
  },

  // ── CRM - Portal Cliente (admin events) ──
  {
    key: 'portal_cliente_access_granted', label: 'Acceso portal cliente',
    description: 'Cuando se habilita el acceso al portal de un contacto de cliente',
    module: 'crm', submodule: 'accounts', category: 'CRM - Portal Cliente',
    audiences: ['admin'], defaults: { admin: adminBell() },
  },
  {
    key: 'portal_cliente_access_revoked', label: 'Acceso portal revocado',
    description: 'Cuando se revoca el acceso al portal de un contacto de cliente',
    module: 'crm', submodule: 'accounts', category: 'CRM - Portal Cliente',
    audiences: ['admin'], defaults: { admin: adminBell() },
  },

  // ── Emergencias y Chat (cross-portal) ──
  {
    key: 'emergency_alert', label: 'Alerta de emergencia',
    description: 'Alertas de emergencia críticas que requieren atención inmediata',
    module: 'ops', category: 'Emergencias',
    audiences: ['admin', 'guardia', 'rondas'],
    defaults: {
      admin: adminBell(true),
      guardia: { push: true, email: true },
      rondas: { push: true, email: true },
    },
    critical: true,
  },
  {
    key: 'chat_message', label: 'Mensaje de chat',
    description: 'Nuevo mensaje en un canal de chat',
    module: 'chat', category: 'Chat',
    audiences: ['admin', 'guardia', 'cliente', 'rondas'],
    defaults: {
      admin:   { bell: false, email: false, push: true },
      guardia: { push: true, email: false },
      cliente: { push: true, email: false },
      rondas:  { push: true, email: false },
    },
  },
];

export const UNIFIED_TYPE_MAP = new Map(
  UNIFIED_NOTIFICATION_TYPES.map((t) => [t.key, t]),
);

export const ALIAS_TO_CANONICAL = new Map<string, string>();
for (const t of UNIFIED_NOTIFICATION_TYPES) {
  ALIAS_TO_CANONICAL.set(t.key, t.key);
  for (const alias of t.aliases ?? []) {
    ALIAS_TO_CANONICAL.set(alias, t.key);
  }
}

export function resolveCanonicalKey(key: string): string | null {
  return ALIAS_TO_CANONICAL.get(key) ?? null;
}

export function getUnifiedType(key: string): UnifiedNotificationType | null {
  const canonical = resolveCanonicalKey(key);
  return canonical ? UNIFIED_TYPE_MAP.get(canonical) ?? null : null;
}
