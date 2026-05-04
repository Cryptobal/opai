/**
 * Tipos compartidos para el módulo de onboarding del cliente post-won.
 */

export const DEFAULT_PLAYBOOK_NAME = "Estándar";
export const DEFAULT_PLAYBOOK_VERSION = 1;

export type OnboardingTicketTypeSeed = {
  slug: string;
  name: string;
  description?: string;
  assignedTeam: string;
  defaultPriority: string;
  slaHours: number;
  icon: string;
  sortOrder: number;
};

export type OnboardingPlaybookStepSeed = {
  slug: string;
  title: string;
  description?: string;
  ticketTypeSlug: string;
  defaultAssignedTeam: string;
  defaultPriority: string;
  dueDateOffsetDays: number;
  phase: number;
  sortOrder: number;
};

export const ONBOARDING_TICKET_TYPES: OnboardingTicketTypeSeed[] = [
  {
    slug: "onboarding_contrato_cliente",
    name: "Contrato cliente firmado",
    description: "Contrato del cliente generado, revisado y firmado.",
    assignedTeam: "finanzas",
    defaultPriority: "p1",
    slaHours: 360,
    icon: "📜",
    sortOrder: 100,
  },
  {
    slug: "onboarding_informe_vulnerabilidad",
    name: "Informe de Vulnerabilidad del sitio",
    description: "Levantar informe de vulnerabilidad del sitio del cliente.",
    assignedTeam: "ops",
    defaultPriority: "p1",
    slaHours: 240,
    icon: "🛡️",
    sortOrder: 101,
  },
  {
    slug: "onboarding_directiva_funcionamiento",
    name: "Directiva de Funcionamiento (OS-10)",
    description: "Redactar y validar la directiva de funcionamiento OS-10.",
    assignedTeam: "ops",
    defaultPriority: "p1",
    slaHours: 168,
    icon: "📋",
    sortOrder: 102,
  },
  {
    slug: "onboarding_protocolos_puesto",
    name: "Protocolos del puesto",
    description: "Definir protocolos operativos por puesto.",
    assignedTeam: "ops",
    defaultPriority: "p2",
    slaHours: 120,
    icon: "📐",
    sortOrder: 103,
  },
  {
    slug: "onboarding_test_conocimiento",
    name: "Test de conocimiento aprobado por guardias",
    description: "Aplicar y aprobar el test de conocimiento al equipo.",
    assignedTeam: "ops",
    defaultPriority: "p1",
    slaHours: 48,
    icon: "🎓",
    sortOrder: 104,
  },
  {
    slug: "onboarding_uniforme_equipamiento",
    name: "Uniforme y equipamiento entregado",
    description: "Entrega de uniforme y equipamiento al personal.",
    assignedTeam: "inventario",
    defaultPriority: "p2",
    slaHours: 72,
    icon: "👕",
    sortOrder: 105,
  },
];

export const ONBOARDING_PLAYBOOK_STEPS: OnboardingPlaybookStepSeed[] = [
  {
    slug: "onboarding_contrato_cliente",
    title: "Contrato cliente firmado",
    ticketTypeSlug: "onboarding_contrato_cliente",
    defaultAssignedTeam: "finanzas",
    defaultPriority: "p1",
    dueDateOffsetDays: -15,
    phase: 1,
    sortOrder: 1,
  },
  {
    slug: "onboarding_informe_vulnerabilidad",
    title: "Informe de Vulnerabilidad del sitio",
    ticketTypeSlug: "onboarding_informe_vulnerabilidad",
    defaultAssignedTeam: "ops",
    defaultPriority: "p1",
    dueDateOffsetDays: -10,
    phase: 2,
    sortOrder: 2,
  },
  {
    slug: "onboarding_directiva_funcionamiento",
    title: "Directiva de Funcionamiento (OS-10)",
    ticketTypeSlug: "onboarding_directiva_funcionamiento",
    defaultAssignedTeam: "ops",
    defaultPriority: "p1",
    dueDateOffsetDays: -7,
    phase: 2,
    sortOrder: 3,
  },
  {
    slug: "onboarding_protocolos_puesto",
    title: "Protocolos del puesto",
    ticketTypeSlug: "onboarding_protocolos_puesto",
    defaultAssignedTeam: "ops",
    defaultPriority: "p2",
    dueDateOffsetDays: -5,
    phase: 2,
    sortOrder: 4,
  },
  {
    slug: "onboarding_test_conocimiento",
    title: "Test de conocimiento aprobado por guardias",
    ticketTypeSlug: "onboarding_test_conocimiento",
    defaultAssignedTeam: "ops",
    defaultPriority: "p1",
    dueDateOffsetDays: -2,
    phase: 3,
    sortOrder: 5,
  },
  {
    slug: "onboarding_uniforme_equipamiento",
    title: "Uniforme y equipamiento entregado",
    ticketTypeSlug: "onboarding_uniforme_equipamiento",
    defaultAssignedTeam: "inventario",
    defaultPriority: "p2",
    dueDateOffsetDays: -3,
    phase: 3,
    sortOrder: 6,
  },
];
