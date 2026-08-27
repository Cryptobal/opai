export const INCIDENTE_TICKET_SLUG = "incidente-instalacion";

export const INCIDENTE_TICKET_TYPE = {
  slug: INCIDENTE_TICKET_SLUG,
  name: "Incidente en instalación",
  description: "Reporte público desde QR en terreno",
  origin: "public_qr",
  assignedTeam: "ops",
  defaultPriority: "p2",
  slaHours: 4,
  requiresApproval: false,
  icon: "Siren",
  sortOrder: 90,
} as const;

export const AUTO_CLOSE_HOURS = 72;
export const MAX_REPORT_FILES = 5;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 120 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 90;
export const MAX_ACCURACY_BONUS_M = 150;
export const MIN_DESCRIPTION_CHARS = 4;
export const MIN_CLOSURE_COMMENT_CHARS = 6;
export const DEDUP_WINDOW_MS = 2 * 60 * 1000;

export const ALLOWED_IMAGE_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
] as const;

export const ALLOWED_VIDEO_MIME = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

export const ALLOWED_REPORT_MIME = [
  ...ALLOWED_IMAGE_MIME,
  ...ALLOWED_VIDEO_MIME,
] as const;

export type IncidenteCategoryId =
  | "emergencia"
  | "sospechoso"
  | "acceso"
  | "dano"
  | "incendio"
  | "otro";

export const INCIDENTE_CATEGORIES: ReadonlyArray<{
  id: IncidenteCategoryId;
  label: string;
  description: string;
  emergency?: boolean;
}> = [
  { id: "emergencia", label: "Emergencia", description: "Riesgo inminente a personas", emergency: true },
  { id: "sospechoso", label: "Persona sospechosa", description: "Conducta o presencia inusual" },
  { id: "acceso", label: "Acceso no autorizado", description: "Ingreso o intento indebido" },
  { id: "dano", label: "Daño o vandalismo", description: "Bienes o instalaciones afectadas" },
  { id: "incendio", label: "Fuego o humo", description: "Olor a quemado, humo o llamas" },
  { id: "otro", label: "Otro", description: "Cualquier otra situación" },
];

export const INCIDENTE_CATEGORY_IDS = new Set(
  INCIDENTE_CATEGORIES.map((c) => c.id),
);

export function isIncidenteCategory(value: string): value is IncidenteCategoryId {
  return INCIDENTE_CATEGORY_IDS.has(value as IncidenteCategoryId);
}

export function categoryLabel(id: string): string {
  return INCIDENTE_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export type AttachmentKind = "report" | "closure" | "general";

export type PublicErrorCode =
  | "TOKEN_INVALID"
  | "CHANNEL_DISABLED"
  | "QR_UNASSIGNED"
  | "OUT_OF_RANGE"
  | "GPS_REQUIRED"
  | "RATE_LIMITED"
  | "FILE_INVALID"
  | "VALIDATION_ERROR"
  | "DUPLICATE"
  | "NOT_FOUND";
