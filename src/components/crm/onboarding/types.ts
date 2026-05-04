/**
 * Tipos client-side para el modal de onboarding del cliente.
 */

export type Light = "green" | "red";

export type ValidationStatus = {
  osTenant: Light;
  accountInfoComplete: Light;
  installationLinked: Light;
  primaryContactWithEmail: Light;
  serviceStartDate: Light;
};

export type PlatformConfigStatus = {
  instalacionCreated: boolean;
  puestosCreated: boolean;
  pautaCurrentMonth: boolean;
  rondasConfigured: boolean;
  marcacionConfigured: boolean;
  testConocimientoConfigured: boolean;
};

export type PlaybookStep = {
  id: string;
  phase: number;
  sortOrder: number;
  slug: string;
  title: string;
  description?: string | null;
  ticketTypeSlug: string;
  defaultAssignedTeam: string;
  defaultAssignedUserId?: string | null;
  defaultPriority: string;
  dueDateOffsetDays: number;
  defaultApplies: boolean;
};

export type PreviewData = {
  validations: ValidationStatus;
  account: { id: string; name: string; rut?: string | null; legalName?: string | null } | null;
  installation: {
    id: string;
    name: string;
    address?: string | null;
    marcacionCode?: string | null;
  } | null;
  serviceStartDate: string | null;
  defaultPlaybook: {
    id: string;
    name: string;
    steps: PlaybookStep[];
  } | null;
  platformConfigStatus: PlatformConfigStatus;
  deal: { id: string; title: string; accountId: string; primaryContactId?: string | null };
};

export type OnboardingStepDraft = {
  key: string;
  playbookStepId?: string;
  isCustom: boolean;
  applies: boolean;
  title: string;
  description?: string;
  ticketTypeSlug?: string;
  assignedTeam: string;
  assignedToUserId?: string | null;
  priority: string;
  dueDateOffsetDays: number;
  saveToPlaybook?: boolean;
  phase: number;
  sortOrder: number;
};

export const TEAM_OPTIONS = [
  { value: "ops", label: "Operaciones" },
  { value: "finanzas", label: "Finanzas" },
  { value: "inventario", label: "Inventario" },
  { value: "rrhh", label: "RRHH" },
  { value: "comercial", label: "Comercial" },
  { value: "soporte", label: "Soporte" },
];

export const PRIORITY_OPTIONS = [
  { value: "p1", label: "P1 — Crítica" },
  { value: "p2", label: "P2 — Alta" },
  { value: "p3", label: "P3 — Normal" },
  { value: "p4", label: "P4 — Baja" },
  { value: "p5", label: "P5 — Mínima" },
];
