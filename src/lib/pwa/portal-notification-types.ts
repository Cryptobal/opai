export interface PortalNotifTypeDef {
  key: string;
  label: string;
  description: string;
  portals: Array<'cliente' | 'guardia' | 'rondas' | 'app'>;
  defaultPush: boolean;
  defaultEmail: boolean;
}

export const PORTAL_NOTIFICATION_TYPES: PortalNotifTypeDef[] = [
  // === SHARED ===
  {
    key: 'chat_message',
    label: 'Mensajes de chat',
    description: 'Cuando recibes un nuevo mensaje',
    portals: ['cliente', 'guardia', 'rondas', 'app'],
    defaultPush: true,
    defaultEmail: false,
  },

  // === PORTAL CLIENTE ===
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
    description: 'Cuando una ronda de vigilancia se completa',
    portals: ['cliente'],
    defaultPush: true,
    defaultEmail: false,
  },
  {
    key: 'ronda_alert',
    label: 'Alerta de ronda',
    description: 'Cuando hay un problema en una ronda',
    portals: ['cliente'],
    defaultPush: true,
    defaultEmail: true,
  },

  // === PORTAL GUARDIA ===
  {
    key: 'shift_reminder',
    label: 'Recordatorio de turno',
    description: 'Recordatorio antes de tu turno',
    portals: ['guardia'],
    defaultPush: true,
    defaultEmail: false,
  },
  {
    key: 'schedule_change',
    label: 'Cambio de horario',
    description: 'Cuando tu horario o asignación cambia',
    portals: ['guardia'],
    defaultPush: true,
    defaultEmail: true,
  },

  // === PORTAL RONDAS ===
  {
    key: 'ronda_assigned',
    label: 'Ronda asignada',
    description: 'Cuando te toca una nueva ronda',
    portals: ['rondas'],
    defaultPush: true,
    defaultEmail: false,
  },
  {
    key: 'ronda_overdue',
    label: 'Ronda atrasada',
    description: 'Cuando una ronda no se ha iniciado a tiempo',
    portals: ['rondas'],
    defaultPush: true,
    defaultEmail: true,
  },
];

export const PORTAL_NOTIFICATION_TYPE_MAP = new Map(
  PORTAL_NOTIFICATION_TYPES.map((t) => [t.key, t])
);
