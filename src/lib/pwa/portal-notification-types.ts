export interface PortalNotifTypeDef {
  key: string;
  label: string;
  description: string;
  portals: Array<'cliente' | 'guardia' | 'rondas' | 'app'>;
  defaultPush: boolean;
  defaultEmail: boolean;
}

export const PORTAL_NOTIFICATION_TYPES: PortalNotifTypeDef[] = [

  // =========================================================
  // COMPARTIDAS (múltiples portales)
  // =========================================================
  {
    key: 'chat_message',
    label: 'Mensajes de chat',
    description: 'Cuando recibes un nuevo mensaje de chat',
    portals: ['cliente', 'guardia', 'rondas', 'app'],
    defaultPush: true,
    defaultEmail: false,
  },
  {
    key: 'emergency_alert',
    label: 'Alerta de emergencia',
    description: 'Alertas de emergencia críticas que requieren atención inmediata',
    portals: ['guardia', 'rondas', 'app'],
    defaultPush: true,
    defaultEmail: true,
  },

  // =========================================================
  // APP OPAI (admin + supervisores)
  // =========================================================

  // Tickets
  {
    key: 'ticket_needs_approval',
    label: 'Ticket pendiente de aprobación',
    description: 'Cuando un ticket llega a tu grupo de aprobación',
    portals: ['app'],
    defaultPush: true,
    defaultEmail: true,
  },
  {
    key: 'ticket_approved',
    label: 'Ticket aprobado',
    description: 'Cuando un ticket es aprobado en el flujo',
    portals: ['app'],
    defaultPush: true,
    defaultEmail: false,
  },
  {
    key: 'ticket_rejected',
    label: 'Ticket rechazado',
    description: 'Cuando un ticket es rechazado en el flujo',
    portals: ['app'],
    defaultPush: true,
    defaultEmail: true,
  },

  // Documentos
  {
    key: 'document_expiring',
    label: 'Documento por vencer',
    description: 'Cuando un documento está próximo a vencer',
    portals: ['app'],
    defaultPush: true,
    defaultEmail: true,
  },
  {
    key: 'document_signed',
    label: 'Documento firmado',
    description: 'Cuando un cliente firma un documento',
    portals: ['app'],
    defaultPush: true,
    defaultEmail: false,
  },
  {
    key: 'document_rejected',
    label: 'Documento rechazado',
    description: 'Cuando un cliente rechaza un documento enviado',
    portals: ['app'],
    defaultPush: true,
    defaultEmail: true,
  },

  // CRM
  {
    key: 'lead_new',
    label: 'Nuevo lead CRM',
    description: 'Cuando se registra un nuevo lead desde el formulario web u otra fuente',
    portals: ['app'],
    defaultPush: true,
    defaultEmail: false,
  },
  {
    key: 'lead_assigned',
    label: 'Lead asignado',
    description: 'Cuando se te asigna un lead para seguimiento',
    portals: ['app'],
    defaultPush: true,
    defaultEmail: true,
  },
  {
    key: 'contract_expiring',
    label: 'Contrato por vencer',
    description: 'Cuando un contrato está próximo a su fecha de término',
    portals: ['app'],
    defaultPush: true,
    defaultEmail: true,
  },

  // CPQ / Cotizaciones
  {
    key: 'quote_accepted',
    label: 'Cotización aceptada',
    description: 'Cuando un cliente acepta una cotización',
    portals: ['app'],
    defaultPush: true,
    defaultEmail: true,
  },
  {
    key: 'quote_rejected',
    label: 'Cotización rechazada',
    description: 'Cuando un cliente rechaza una cotización',
    portals: ['app'],
    defaultPush: true,
    defaultEmail: true,
  },

  // Rondas (admin)
  {
    key: 'ronda_alert_admin',
    label: 'Alerta de ronda (admin)',
    description: 'Cuando se detecta un incidente o problema en una ronda',
    portals: ['app'],
    defaultPush: true,
    defaultEmail: true,
  },
  {
    key: 'ronda_overdue_admin',
    label: 'Ronda atrasada (admin)',
    description: 'Cuando una ronda no se inicia a tiempo',
    portals: ['app'],
    defaultPush: true,
    defaultEmail: false,
  },

  // Personal / Guardias
  {
    key: 'guard_no_checkin',
    label: 'Guardia sin check-in',
    description: 'Cuando un guardia no registra su entrada al turno',
    portals: ['app'],
    defaultPush: true,
    defaultEmail: true,
  },

  // Supervisión (rol supervisor en app)
  {
    key: 'supervision_visit_due',
    label: 'Visita de supervisión pendiente',
    description: 'Cuando tienes una visita de supervisión programada próxima',
    portals: ['app'],
    defaultPush: true,
    defaultEmail: false,
  },
  {
    key: 'expense_report_submitted',
    label: 'Rendición de gastos enviada',
    description: 'Cuando un supervisor envía una rendición de gastos para revisión',
    portals: ['app'],
    defaultPush: true,
    defaultEmail: false,
  },

  // Payroll
  {
    key: 'payroll_processed',
    label: 'Liquidación procesada',
    description: 'Cuando se procesan las liquidaciones de sueldo del período',
    portals: ['app'],
    defaultPush: false,
    defaultEmail: true,
  },

  // =========================================================
  // PORTAL CLIENTE
  // =========================================================
  {
    key: 'ticket_created',
    label: 'Ticket creado',
    description: 'Cuando se crea un ticket en tu instalación',
    portals: ['cliente'],
    defaultPush: true,
    defaultEmail: true,
  },
  {
    key: 'ticket_updated',
    label: 'Ticket actualizado',
    description: 'Cuando un ticket cambia de estado',
    portals: ['cliente'],
    defaultPush: true,
    defaultEmail: false,
  },
  {
    key: 'ronda_completed',
    label: 'Ronda completada',
    description: 'Cuando una ronda de vigilancia se completa en tu instalación',
    portals: ['cliente'],
    defaultPush: true,
    defaultEmail: false,
  },
  {
    key: 'ronda_alert',
    label: 'Alerta de ronda',
    description: 'Cuando hay un incidente o problema en una ronda de tu instalación',
    portals: ['cliente'],
    defaultPush: true,
    defaultEmail: true,
  },
  {
    key: 'document_available',
    label: 'Documento disponible',
    description: 'Cuando hay un nuevo documento para revisar o firmar',
    portals: ['cliente'],
    defaultPush: true,
    defaultEmail: true,
  },
  {
    key: 'invoice_due',
    label: 'Factura próxima a vencer',
    description: 'Recordatorio de factura o pago próximo a su fecha límite',
    portals: ['cliente'],
    defaultPush: false,
    defaultEmail: true,
  },

  // =========================================================
  // PORTAL GUARDIA
  // =========================================================
  {
    key: 'shift_reminder',
    label: 'Recordatorio de turno',
    description: 'Recordatorio antes del inicio de tu turno',
    portals: ['guardia'],
    defaultPush: true,
    defaultEmail: false,
  },
  {
    key: 'schedule_change',
    label: 'Cambio de horario',
    description: 'Cuando tu horario o asignación de instalación cambia',
    portals: ['guardia'],
    defaultPush: true,
    defaultEmail: true,
  },
  {
    key: 'ticket_assigned_guard',
    label: 'Ticket asignado',
    description: 'Cuando se te asigna un ticket para gestionar',
    portals: ['guardia'],
    defaultPush: true,
    defaultEmail: false,
  },
  {
    key: 'document_to_sign',
    label: 'Documento para firmar',
    description: 'Cuando hay un nuevo documento que requiere tu firma',
    portals: ['guardia'],
    defaultPush: true,
    defaultEmail: true,
  },
  {
    key: 'inventory_delivery',
    label: 'Entrega de equipamiento',
    description: 'Cuando se te entrega uniformes o equipamiento',
    portals: ['guardia'],
    defaultPush: true,
    defaultEmail: false,
  },

  // =========================================================
  // PORTAL RONDAS
  // =========================================================
  {
    key: 'ronda_assigned',
    label: 'Ronda asignada',
    description: 'Cuando se te asigna una nueva ronda para ejecutar',
    portals: ['rondas'],
    defaultPush: true,
    defaultEmail: false,
  },
  {
    key: 'ronda_overdue',
    label: 'Ronda atrasada',
    description: 'Cuando una ronda asignada no se ha iniciado a tiempo',
    portals: ['rondas'],
    defaultPush: true,
    defaultEmail: true,
  },
  {
    key: 'checkpoint_missed',
    label: 'Checkpoint no escaneado',
    description: 'Cuando un checkpoint no fue escaneado en el tiempo esperado',
    portals: ['rondas'],
    defaultPush: true,
    defaultEmail: false,
  },
  {
    key: 'ronda_cancelled',
    label: 'Ronda cancelada',
    description: 'Cuando una ronda asignada es cancelada',
    portals: ['rondas'],
    defaultPush: true,
    defaultEmail: false,
  },
];

export const PORTAL_NOTIFICATION_TYPE_MAP = new Map(
  PORTAL_NOTIFICATION_TYPES.map((t) => [t.key, t])
);
