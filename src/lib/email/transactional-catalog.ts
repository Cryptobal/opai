import type { EmailModule } from "@/lib/resend";

export interface TransactionalEmailKind {
  /** Identificador interno — usar snake_case. Inmutable una vez en producción. */
  key: string;
  /** Etiqueta humana (es-CL). */
  label: string;
  /** Descripción para el usuario en la UI. */
  description: string;
  /** Módulo lógico — define routing por defecto. */
  module: EmailModule;
  /** Categoría humana para agrupar en UI. */
  category: string;
  /** Si true, el toggle no se puede desactivar (correo crítico de sistema). */
  required?: boolean;
}

export const TRANSACTIONAL_EMAIL_CATALOG: TransactionalEmailKind[] = [
  // ── Comercial ──
  { key: "cpq_portal_invite",        label: "Invitación al portal del cliente", description: "Cuando se envía una cotización por el portal, el contacto recibe un email con PIN y link.", module: "commercial", category: "CPQ - Cotizaciones" },
  { key: "cpq_quote_resend",         label: "Reenvío manual de cotización",     description: "Cuando un usuario reenvía manualmente una cotización ya creada.", module: "commercial", category: "CPQ - Cotizaciones" },
  { key: "cpq_quote_accepted",       label: "Aviso de aceptación de propuesta", description: "Al cliente cuando acepta una propuesta en el portal.", module: "commercial", category: "CPQ - Cotizaciones" },
  { key: "cpq_visit_request",        label: "Solicitud de visita técnica",      description: "Cuando se solicita una visita técnica desde una cotización.", module: "commercial", category: "CPQ - Cotizaciones" },
  { key: "crm_presentation_sent",    label: "Envío de presentación comercial",  description: "Cuando un usuario envía la presentación de la empresa por email desde el CRM.", module: "commercial", category: "CRM - Presentaciones" },
  { key: "crm_portal_invite",        label: "Invitación al portal (CRM)",       description: "Cuando se invita a un contacto al portal del cliente directamente desde el CRM.", module: "commercial", category: "CRM - Portal" },
  { key: "portal_cliente_pin_reset", label: "Recuperación de PIN del portal",   description: "Cuando un cliente pide recuperar su PIN del portal.", module: "commercial", category: "Portal Cliente" },

  // ── Finanzas ──
  { key: "dte_invoice_sent",           label: "Envío de factura emitida",          description: "Factura electrónica al receptor con PDF y XML.", module: "finance", category: "DTE - Facturación", required: true },
  { key: "dte_credit_note_sent",       label: "Envío de nota de crédito",          description: "Nota de crédito al receptor con PDF y XML.", module: "finance", category: "DTE - Facturación", required: true },
  { key: "dte_debit_note_sent",        label: "Envío de nota de débito",           description: "Nota de débito al receptor con PDF y XML.", module: "finance", category: "DTE - Facturación", required: true },
  { key: "dte_proforma_sent",          label: "Envío de proforma",                 description: "Pre-factura/cotización tributaria al cliente antes de emitir.", module: "finance", category: "DTE - Facturación" },
  { key: "dte_payment_statement_sent", label: "Envío de estado de pago",           description: "Detalle del período facturado al cliente.", module: "finance", category: "DTE - Facturación" },
  { key: "dte_backoffice_copy",        label: "Copia XML al backoffice/contador",  description: "Copia interna del XML del DTE al contador externo.", module: "finance", category: "DTE - Facturación" },
  { key: "cobranza_amable",            label: "Cobranza amable (recordatorio)",    description: "Recordatorio amistoso por factura próxima o recién vencida.", module: "finance", category: "Cobranza" },
  { key: "cobranza_firme",             label: "Cobranza firme",                    description: "Recordatorio firme por factura vencida.", module: "finance", category: "Cobranza" },
  { key: "cobranza_prejudicial",       label: "Aviso pre-judicial",                description: "Aviso final antes de acciones legales.", module: "finance", category: "Cobranza" },
  { key: "rendicion_submitted",        label: "Rendición enviada para aprobación", description: "Al aprobador cuando se envía una rendición.", module: "finance", category: "Rendiciones" },
  { key: "rendicion_approved",         label: "Rendición aprobada",                description: "Al submitter cuando su rendición es aprobada.", module: "finance", category: "Rendiciones" },
  { key: "rendicion_rejected",         label: "Rendición rechazada",               description: "Al submitter cuando su rendición es rechazada.", module: "finance", category: "Rendiciones" },
  { key: "rendicion_paid",             label: "Rendición pagada",                  description: "Al submitter cuando se confirma el pago de su rendición.", module: "finance", category: "Rendiciones" },
  { key: "factoring_cession_sent",     label: "Cesión de factura (factoring)",     description: "Envío de AEC al factor / SII.", module: "finance", category: "Factoring" },
  { key: "dte_rejected_alert",         label: "Alerta de DTE rechazado por SII",   description: "Aviso interno cuando el SII rechaza un DTE emitido.", module: "finance", category: "DTE - Alertas", required: true },

  // ── Operaciones ──
  { key: "ticket_created",          label: "Ticket creado",                     description: "Al asignado y al cliente cuando se crea un ticket.", module: "operations", category: "Tickets" },
  { key: "ticket_comment",          label: "Nuevo comentario en ticket",        description: "Email bidireccional cuando hay un comentario en un ticket.", module: "operations", category: "Tickets" },
  { key: "ticket_confirmation",     label: "Confirmación de ticket",            description: "Email de confirmación al cliente cuando un ticket cierra.", module: "operations", category: "Tickets" },
  { key: "cobertura_alert",         label: "Alerta de cobertura",               description: "Reporte de cobertura nocturna / alertas operacionales.", module: "operations", category: "Cobertura" },
  { key: "rondas_monitor",          label: "Reporte de monitoreo de rondas",    description: "Email de monitoreo de rondas no realizadas / atrasadas.", module: "operations", category: "Rondas" },
  { key: "guard_event_doc",         label: "Documento de evento de guardia",    description: "Envío de documento generado por evento de guardia.", module: "operations", category: "Guardias" },
  { key: "marcacion_oposicion",     label: "Oposición a marca manual",          description: "Cuando un guardia se opone a una marca manual.", module: "operations", category: "Asistencia" },
  { key: "control_nocturno_report", label: "Reporte de control nocturno",       description: "Resumen nocturno operacional.", module: "operations", category: "Control Nocturno" },
  { key: "ops_refuerzo_alert",      label: "Alerta de refuerzo operacional",    description: "Solicitud de refuerzo en instalaciones.", module: "operations", category: "Refuerzos" },
  { key: "guardia_communication",   label: "Comunicación a guardia",            description: "Mensajes y comunicaciones al guardia.", module: "operations", category: "Guardias" },

  // ── Sistema ──
  { key: "signup_verification",  label: "Verificación de signup",           description: "Verificación de email en nuevo signup.", module: "system", category: "Onboarding", required: true },
  { key: "forgot_password",      label: "Recuperación de contraseña",       description: "Recuperación de contraseña.", module: "system", category: "Auth", required: true },
  { key: "user_invitation",      label: "Invitación a usuario",             description: "Invitación a un nuevo usuario admin.", module: "system", category: "Onboarding" },
  { key: "plan_upgrade_request", label: "Solicitud de upgrade de plan",     description: "Al equipo de OPAI cuando un tenant pide upgrade.", module: "system", category: "Billing" },
  { key: "tenant_alert",         label: "Alerta de plataforma",             description: "Alertas críticas de la plataforma al tenant.", module: "system", category: "Plataforma" },
];

export function getTransactionalKind(key: string): TransactionalEmailKind | undefined {
  return TRANSACTIONAL_EMAIL_CATALOG.find((k) => k.key === key);
}

export function getTransactionalKindsByCategory(): Record<string, TransactionalEmailKind[]> {
  const out: Record<string, TransactionalEmailKind[]> = {};
  for (const k of TRANSACTIONAL_EMAIL_CATALOG) {
    if (!out[k.category]) out[k.category] = [];
    out[k.category]!.push(k);
  }
  return out;
}
