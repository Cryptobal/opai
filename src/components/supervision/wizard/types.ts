// Shared types for the supervision visit wizard

export type WizardStep = 1 | 2 | 3 | 4 | 5;

export type NearbyInstallation = {
  id: string;
  name: string;
  address: string | null;
  commune: string | null;
  city: string | null;
  clientName: string | null;
  geoRadiusM: number;
  distanceM: number | null;
  insideGeofence: boolean | null;
};

export type DotacionGuard = {
  id: string;
  type: "regular" | "reinforcement";
  guardId: string;
  guardName: string;
  guardRut: string | null;
  puestoName: string;
  slotNumber: number | null;
  shiftStart: string | null;
  shiftEnd: string | null;
};

export type GuardEvaluation = {
  guardId: string | null;
  guardName: string;
  isReinforcement: boolean;
  presentationScore: number | null;
  orderScore: number | null;
  protocolScore: number | null;
  observation: string;
};

export type ChecklistItem = {
  id: string;
  name: string;
  category: string | null;
  isMandatory: boolean;
  sortOrder: number;
};

export type ChecklistResult = {
  checklistItemId: string;
  isChecked: boolean;
  findingId: string | null;
};

export type Finding = {
  id: string;
  category: string;
  severity: string;
  description: string;
  status: string;
  guardId: string | null;
  photoUrl: string | null;
  createdAt: string;
};

export type PhotoCategory = {
  id: string;
  name: string;
  isMandatory: boolean;
  sortOrder: number;
};

export type CapturedPhoto = {
  categoryId: string | null;
  categoryName: string;
  file: File;
  previewUrl: string;
  uploaded: boolean;
  uploadedId?: string;
};

export type VisitData = {
  id: string;
  installationId: string;
  status: string;
  wizardStep: number;
  checkInAt: string;
  guardsExpected: number | null;
  guardsFound: number | null;
  installationState: string | null;
  generalComments: string | null;
  bookUpToDate: boolean | null;
  bookLastEntryDate: string | null;
  bookNotes: string | null;
  clientContacted: boolean;
  clientContactName: string | null;
  clientSatisfaction: number | null;
  clientComment: string | null;
  draftData: Record<string, unknown> | null;
};

export type SurveyData = {
  serviceQuality: number | null;
  scheduleCompliance: number | null;
  personalPresentation: number | null;
  professionalism: number | null;
  complaintsSuggestions: string;
  npsScore: number | null;
};

export const FINDING_CATEGORIES = [
  { value: "personal", label: "Personal (uniforme, credencial, actitud)" },
  { value: "infrastructure", label: "Infraestructura (cámaras, alarmas, extintores)" },
  { value: "documentation", label: "Documentación (OS10, libro, contrato)" },
  { value: "operational", label: "Operativo (protocolo, rondas, registro)" },
] as const;

export const FINDING_SEVERITIES = [
  { value: "critical", label: "Crítico", color: "text-red-400" },
  { value: "major", label: "Mayor", color: "text-amber-400" },
  { value: "minor", label: "Menor", color: "text-blue-400" },
] as const;

export const INSTALLATION_STATES = [
  { value: "normal", label: "Normal" },
  { value: "incidencia", label: "Con observaciones" },
  { value: "critico", label: "Crítico" },
] as const;
