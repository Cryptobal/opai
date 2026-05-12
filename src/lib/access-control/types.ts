/**
 * Access Control Module — Types & Interfaces
 */

// ═══════════════════════════════════════════════════════════════
//  ENUMS / LITERALS
// ═══════════════════════════════════════════════════════════════

export type AccessRecordType = "visit" | "provider" | "vehicle" | "staff" | "delivery";

export type ListType = "whitelist" | "blacklist";
export type ListScope = "local" | "global";

export type QrSource = "cedula_2013" | "cedula_2024" | "manual" | "preregistered";
export type IdValidationStatus = "valid" | "invalid" | "not_checked" | "error";
export type ListMatch = "whitelist" | "blacklist";

export type PreregistrationStatus = "pending" | "checked_in" | "checked_out" | "no_show" | "cancelled";
export type AutoReportSchedule = "daily" | "weekly" | "monthly";

export type PlateFormat = "old" | "new" | "moto" | "unknown";

// ═══════════════════════════════════════════════════════════════
//  CONFIGURATION
// ═══════════════════════════════════════════════════════════════

export interface FormFieldConfig {
  field: string;
  label: string;
  type: "text" | "number" | "select" | "boolean" | "date" | "photo" | "textarea" | "signature";
  required: boolean;
  order: number;
  options?: string[]; // for select fields
  placeholder?: string;
}

export interface AccessControlFormConfig {
  visit?: FormFieldConfig[];
  provider?: FormFieldConfig[];
  vehicle?: FormFieldConfig[];
  staff?: FormFieldConfig[];
  delivery?: FormFieldConfig[];
}

export interface AccessControlConfigData {
  id?: string;
  installationId: string;
  enabledRecordTypes: AccessRecordType[];
  useWhitelist: boolean;
  useBlacklist: boolean;
  requireIdValidation: boolean;
  requirePhoto: boolean;
  requireSignature: boolean;
  maxStayHours: number | null;
  autoReportSchedule: AutoReportSchedule | null;
  formConfig: AccessControlFormConfig;
  /** Per-installation override of the type's display label. Keys are
   *  AccessRecordType ids; missing keys fall back to RECORD_TYPE_CONFIG. */
  recordTypeLabels?: Partial<Record<AccessRecordType, string>>;
  /** Per-installation override of the type's lucide icon name. Keys are
   *  AccessRecordType ids; missing keys fall back to RECORD_TYPE_CONFIG. */
  recordTypeIcons?: Partial<Record<AccessRecordType, string>>;
}

// ═══════════════════════════════════════════════════════════════
//  LISTS (WHITELIST / BLACKLIST)
// ═══════════════════════════════════════════════════════════════

export interface AccessControlListEntry {
  id: string;
  installationId: string | null;
  listType: ListType;
  rut: string;
  fullName: string;
  company?: string | null;
  blockReason?: string | null;
  scope: ListScope;
  validFrom?: string | null;
  validUntil?: string | null;
  allowedDays: number[];
  allowedTimeFrom?: string | null;
  allowedTimeTo?: string | null;
  isActive: boolean;
  recordType?: AccessRecordType | null;
  singleUse?: boolean;
  usedAt?: string | null;
  createdBy?: string | null;
  createdAt: string;
}

export interface ListImportRow {
  rut: string;
  fullName: string;
  company?: string;
  blockReason?: string;
  validFrom?: string;
  validUntil?: string;
}

export interface ListImportResult {
  total: number;
  imported: number;
  errors: Array<{ row: number; rut: string; error: string }>;
}

// ═══════════════════════════════════════════════════════════════
//  RECORDS
// ═══════════════════════════════════════════════════════════════

export interface AccessControlRecordData {
  id: string;
  installationId: string;
  recordType: AccessRecordType;
  rut: string | null;
  fullName: string | null;
  company: string | null;
  documentSerial: string | null;
  entryAt: string;
  exitAt: string | null;
  entryGuardId: string;
  exitGuardId: string | null;
  entryGpsLat: number | null;
  entryGpsLng: number | null;
  vehiclePlate: string | null;
  vehicleType: string | null;
  vehicleBrandModel: string | null;
  visitorPhotoUrl: string | null;
  customFields: Record<string, unknown>;
  qrSource: QrSource | null;
  idValidationStatus: IdValidationStatus;
  listMatch: ListMatch | null;
  preregistrationId: string | null;
  entryObservations: string | null;
  exitObservations: string | null;
}

export interface EntryFormData {
  recordType: AccessRecordType;
  rut?: string;
  fullName?: string;
  company?: string;
  contactPerson?: string;
  department?: string;
  purpose?: string;
  vehiclePlate?: string;
  vehicleType?: string;
  vehicleBrandModel?: string;
  vehicleContent?: string;
  orderNumber?: string;
  eppVerified?: boolean;
  observations?: string;
  customFields?: Record<string, unknown>;
  // Meta
  qrSource?: QrSource;
  documentSerial?: string;
  preregistrationId?: string;
  // GPS
  gpsLat?: number;
  gpsLng?: number;
  // Offline
  deviceId?: string;
  offlineCreatedAt?: string;
}

// ═══════════════════════════════════════════════════════════════
//  VALIDATION RESULTS
// ═══════════════════════════════════════════════════════════════

export interface RutValidationResult {
  valid: boolean;
  listMatch: ListMatch | null;
  personData: {
    id?: string;
    fullName?: string;
    company?: string;
    blockReason?: string;
    scope?: ListScope;
    validFrom?: string | null;
    validUntil?: string | null;
    allowedDays?: number[];
    allowedTimeFrom?: string | null;
    allowedTimeTo?: string | null;
    isWithinSchedule?: boolean;
    isWithinValidity?: boolean;
  } | null;
  isFrequent: boolean;
  frequentData?: {
    fullName: string;
    company?: string | null;
    lastVisitAt?: string | null;
    visitCount: number;
  };
  preregistration?: {
    id: string;
    visitorName: string;
    hostName?: string | null;
    purpose?: string | null;
    expectedDate: string;
  } | null;
}

export interface CedulaValidationResult {
  valid: boolean;
  status: "vigente" | "no_vigente" | "bloqueada" | "error" | "not_checked";
  message?: string;
}

export interface PlateOcrResult {
  plate: string | null;
  confidence: number;
  format: PlateFormat;
  error?: string;
}

export interface MrzOcrResult {
  fullName: string | null;
  rut: string | null;
  mrzLine1: string | null;
  mrzLine2: string | null;
  mrzLine3: string | null;
  confidence: number;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════
//  QR CEDULA
// ═══════════════════════════════════════════════════════════════

export interface ParsedMRZ {
  surname: string;
  givenNames: string;
  fullName: string;
  documentNumber?: string;
  dateOfBirth?: string;
  sex?: string;
  expiryDate?: string;
  nationality?: string;
}

export interface CedulaQRData {
  rut: string;
  serial: string;
  mrz?: string;
  parsedMrz?: ParsedMRZ;
  type: string;
  source: "cedula_2013" | "cedula_2024";
  validationUrl: string;
}

// ═══════════════════════════════════════════════════════════════
//  PRE-REGISTRATION
// ═══════════════════════════════════════════════════════════════

export interface PreregistrationData {
  id: string;
  installationId: string;
  visitorRut: string;
  visitorName: string;
  visitorCompany: string | null;
  hostName: string | null;
  hostContact: string | null;
  expectedDate: string;
  expectedTimeFrom: string | null;
  expectedTimeTo: string | null;
  purpose: string | null;
  recordType: AccessRecordType;
  status: PreregistrationStatus;
  createdByClient: boolean;
  createdAt: string;
}

// ═══════════════════════════════════════════════════════════════
//  STATS / KPIs
// ═══════════════════════════════════════════════════════════════

export interface AccessControlStats {
  totalEntriesToday: number;
  totalExitsToday: number;
  currentlyInSite: number;
  currentVehiclesInSite: number;
  averageStayMinutes: number;
  byType: Record<AccessRecordType, number>;
}

// ═══════════════════════════════════════════════════════════════
//  OFFLINE SYNC
// ═══════════════════════════════════════════════════════════════

export interface OfflineSyncPayload {
  records: Array<EntryFormData & { localId: string; entryAt: string }>;
  exits: Array<{ recordId: string; exitAt: string; exitObservations?: string; gpsLat?: number; gpsLng?: number }>;
}

export interface OfflineSyncResult {
  synced: number;
  errors: Array<{ localId: string; error: string }>;
}

export type SyncStatus = "online" | "syncing" | "offline";

// ═══════════════════════════════════════════════════════════════
//  UI CONSTANTS
// ═══════════════════════════════════════════════════════════════

export const RECORD_TYPE_CONFIG: Record<AccessRecordType, { label: string; icon: string; color: string }> = {
  visit: { label: "Visita", icon: "UserPlus", color: "blue" },
  provider: { label: "Proveedor", icon: "Truck", color: "orange" },
  vehicle: { label: "Vehículo", icon: "Car", color: "purple" },
  staff: { label: "Personal", icon: "BadgeCheck", color: "green" },
  delivery: { label: "Despacho", icon: "Package", color: "amber" },
};

/** Icons available in the icon picker for customizing a record type. Keep
 *  this list small and curated — every icon listed here must also be wired
 *  in `RECORD_TYPE_ICON_MAP` (see `record-type-display.tsx`). */
export const AVAILABLE_RECORD_TYPE_ICONS = [
  "UserPlus",
  "Truck",
  "Car",
  "BadgeCheck",
  "Package",
  "Users",
  "Briefcase",
  "ShieldCheck",
  "ClipboardList",
  "Wrench",
  "Bike",
  "Bus",
] as const;
export type AvailableRecordTypeIcon = (typeof AVAILABLE_RECORD_TYPE_ICONS)[number];

/** Returns the customized label for a record type, falling back to the
 *  default in RECORD_TYPE_CONFIG. Safe to call with a partial/undefined
 *  config — useful for back-office views that don't load per-installation
 *  overrides. */
export function getRecordTypeLabel(
  type: AccessRecordType,
  config?: { recordTypeLabels?: Partial<Record<AccessRecordType, string>> } | null,
): string {
  const override = config?.recordTypeLabels?.[type];
  if (override && override.trim().length > 0) return override;
  return RECORD_TYPE_CONFIG[type]?.label ?? type;
}

/** Returns the icon name (lucide) to use for a record type. Returns a string
 *  so the component layer can map it to a React element (icons are not safe
 *  to embed in shared types — they would pull React into server bundles). */
export function getRecordTypeIconName(
  type: AccessRecordType,
  config?: { recordTypeIcons?: Partial<Record<AccessRecordType, string>> } | null,
): string {
  const override = config?.recordTypeIcons?.[type];
  if (override && override.trim().length > 0) return override;
  return RECORD_TYPE_CONFIG[type]?.icon ?? "UserPlus";
}

export const PREREGISTRATION_STATUS_CONFIG: Record<PreregistrationStatus, { label: string; color: string }> = {
  pending: { label: "Pendiente", color: "yellow" },
  checked_in: { label: "Ingresó", color: "green" },
  checked_out: { label: "Salió", color: "blue" },
  no_show: { label: "No se presentó", color: "red" },
  cancelled: { label: "Cancelado", color: "gray" },
};

/** Default form fields for each record type */
export const DEFAULT_FORM_FIELDS: Record<AccessRecordType, FormFieldConfig[]> = {
  visit: [
    { field: "rut", label: "RUT", type: "text", required: true, order: 1 },
    { field: "full_name", label: "Nombre Completo", type: "text", required: true, order: 2 },
    { field: "company", label: "Empresa", type: "text", required: false, order: 3 },
    { field: "contact_person", label: "Persona a Visitar", type: "text", required: true, order: 4 },
    { field: "department", label: "Departamento / Área", type: "text", required: false, order: 5 },
    { field: "purpose", label: "Motivo de Visita", type: "text", required: false, order: 6 },
    { field: "observations", label: "Observaciones", type: "textarea", required: false, order: 7 },
  ],
  provider: [
    { field: "rut", label: "RUT", type: "text", required: true, order: 1 },
    { field: "full_name", label: "Nombre Completo", type: "text", required: true, order: 2 },
    { field: "company", label: "Empresa", type: "text", required: true, order: 3 },
    { field: "contact_person", label: "Persona que Autorizó", type: "text", required: false, order: 4 },
    { field: "purpose", label: "Motivo", type: "text", required: false, order: 5 },
    { field: "epp_verified", label: "EPP Verificado", type: "boolean", required: false, order: 6 },
    { field: "observations", label: "Observaciones", type: "textarea", required: false, order: 7 },
  ],
  vehicle: [
    { field: "vehicle_plate", label: "Patente", type: "text", required: true, order: 1 },
    { field: "vehicle_type", label: "Tipo de Vehículo", type: "select", required: true, order: 2, options: ["Particular", "Carga", "Moto", "Bus", "Otro"] },
    { field: "vehicle_brand_model", label: "Marca / Modelo / Color", type: "text", required: false, order: 3 },
    { field: "rut", label: "RUT Conductor", type: "text", required: false, order: 4 },
    { field: "full_name", label: "Nombre Conductor", type: "text", required: false, order: 5 },
    { field: "company", label: "Empresa", type: "text", required: false, order: 6 },
    { field: "vehicle_content", label: "Contenido / Carga", type: "textarea", required: false, order: 7 },
    { field: "observations", label: "Observaciones", type: "textarea", required: false, order: 8 },
  ],
  staff: [
    { field: "rut", label: "RUT", type: "text", required: true, order: 1 },
    { field: "full_name", label: "Nombre Completo", type: "text", required: true, order: 2 },
    { field: "department", label: "Departamento", type: "text", required: false, order: 3 },
    { field: "observations", label: "Observaciones", type: "textarea", required: false, order: 4 },
  ],
  delivery: [
    { field: "rut", label: "RUT Repartidor", type: "text", required: false, order: 1 },
    { field: "full_name", label: "Nombre Repartidor", type: "text", required: false, order: 2 },
    { field: "company", label: "Empresa de Despacho", type: "text", required: true, order: 3 },
    { field: "order_number", label: "N° Orden / Guía", type: "text", required: false, order: 4 },
    { field: "contact_person", label: "Destinatario", type: "text", required: true, order: 5 },
    { field: "observations", label: "Observaciones", type: "textarea", required: false, order: 6 },
  ],
};
