/**
 * Access Control Module — Types & Interfaces
 */

// ═══════════════════════════════════════════════════════════════
//  ENUMS / LITERALS
// ═══════════════════════════════════════════════════════════════

/**
 * The 5 built-in record type ids. They live forever in code and can be
 * disabled per installation but not deleted; this protects historical
 * AccessControlRecord rows from losing their type. New custom types
 * created at runtime use a server-generated `custom_<random>` key.
 */
export const DEFAULT_RECORD_TYPE_IDS = ["visit", "provider", "vehicle", "staff", "delivery"] as const;
export type DefaultRecordTypeId = (typeof DEFAULT_RECORD_TYPE_IDS)[number];

/**
 * Runtime record type id. Used to be a literal union; now any string is
 * accepted to allow per-installation custom types. Built-in ids are
 * exported as `DEFAULT_RECORD_TYPE_IDS` for the few code paths that need
 * to special-case the defaults (e.g. the vehicle entry flow).
 */
export type AccessRecordType = string;

/** Helper: is this id one of the 5 defaults? */
export function isDefaultRecordType(id: string): id is DefaultRecordTypeId {
  return (DEFAULT_RECORD_TYPE_IDS as readonly string[]).includes(id);
}

export type ListType = "whitelist" | "blacklist";
export type ListScope = "local" | "global";

export type QrSource = "cedula_2013" | "cedula_2024" | "manual" | "preregistered";
export type IdValidationStatus = "valid" | "invalid" | "not_checked" | "error";
export type ListMatch = "whitelist" | "blacklist";

export type PreregistrationStatus = "pending" | "checked_in" | "checked_out" | "no_show" | "cancelled";
export type AutoReportSchedule = "daily" | "weekly" | "monthly";

export type PlateFormat = "old" | "new" | "moto" | "unknown";

/**
 * How a custom record type starts on the guard's portal.
 *   "plate" → open VehiclePlateOCR straight away (like the built-in vehicle)
 *   "rut"   → open the CedulaQRScanner / manual RUT step (like visit/provider)
 *   "none"  → skip scanners; go straight to manual form fields
 * Built-in default types hard-code their own behavior in AccessControlEntry,
 * so this only applies to custom (admin-created) types.
 */
export type ScanMode = "plate" | "rut" | "none";
export const SCAN_MODES = ["plate", "rut", "none"] as const;

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

/** Form fields per record type. Keyed by record type id — the 5 default
 *  ids (visit/provider/vehicle/staff/delivery) plus any custom keys. */
export type AccessControlFormConfig = Record<string, FormFieldConfig[] | undefined>;

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
  recordTypeLabels?: Partial<Record<string, string>>;
  /** Per-installation override of the type's lucide icon name. Keys are
   *  AccessRecordType ids; missing keys fall back to RECORD_TYPE_CONFIG. */
  recordTypeIcons?: Partial<Record<string, string>>;
  /** Per-installation override of the scan modes enabled for each default
   *  record type. Keys are AccessRecordType ids; values are arrays of
   *  ScanMode (e.g. `["rut", "plate"]` to allow both). Custom types use
   *  their own `scanModes` field instead. */
  recordTypeScanModes?: Partial<Record<string, ScanMode[]>>;
  /** Custom record types created for this installation. Stored in a
   *  separate table, included in this payload so the mobile portal and
   *  admin get them in one round-trip. Inactive types are omitted from
   *  this list but historic records keep resolving via their `key`. */
  customRecordTypes?: CustomRecordType[];
}

/** A user-defined record type created at runtime for one installation.
 *  Backed by the AccessControlRecordType table; the `key` is the value
 *  stored on AccessControlRecord.recordType. */
export interface CustomRecordType {
  id: string;
  key: string;
  label: string;
  icon: string;
  defaultFields: FormFieldConfig[];
  /** @deprecated usar scanModes (plural) */
  scanMode: ScanMode;
  /** Modos de escaneo soportados por este tipo. Vacío = comportamiento
   *  legacy basado en `scanMode`. Si tiene varios modos, el guardia elige
   *  cuál usar al iniciar el registro. */
  scanModes: ScanMode[];
  orderIdx: number;
  isActive: boolean;
}

/** Seed fields used when an admin creates a new custom type, picked by the
 *  scan mode chosen in the "Nuevo tipo de registro" modal. The admin can
 *  edit / reorder / remove these immediately after creation. */
export const SEED_FIELDS_BY_SCAN_MODE: Record<ScanMode, FormFieldConfig[]> = {
  plate: [
    { field: "vehicle_plate", label: "Patente", type: "text", required: true, order: 1 },
    { field: "vehicle_type", label: "Tipo de Vehículo", type: "select", required: true, order: 2, options: ["Particular", "Carga", "Moto", "Bus", "Otro"] },
    { field: "vehicle_brand_model", label: "Marca / Modelo / Color", type: "text", required: false, order: 3 },
    { field: "observations", label: "Observaciones", type: "textarea", required: false, order: 4 },
  ],
  rut: [
    { field: "rut", label: "RUT", type: "text", required: true, order: 1 },
    { field: "full_name", label: "Nombre Completo", type: "text", required: true, order: 2 },
    { field: "company", label: "Empresa", type: "text", required: false, order: 3 },
    { field: "observations", label: "Observaciones", type: "textarea", required: false, order: 4 },
  ],
  none: [
    { field: "full_name", label: "Nombre", type: "text", required: true, order: 1 },
    { field: "observations", label: "Observaciones", type: "textarea", required: false, order: 2 },
  ],
};

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
  byType: Record<string, number>;
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

/**
 * Display config for the 5 built-in record types. Keyed by string (not
 * DefaultRecordTypeId) so call sites can index by an arbitrary type id
 * — custom types simply return `undefined` and the caller falls back to
 * `getRecordTypeLabel` / `getRecordTypeIconName` which resolve via the
 * per-installation config.
 *
 * Always access via the helpers when you have a `config`; this constant
 * is for back-office views that don't know which installation a record
 * comes from.
 */
export const RECORD_TYPE_CONFIG: Partial<Record<string, { label: string; icon: string; color: string }>> = {
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

type LabelResolverConfig = {
  recordTypeLabels?: Partial<Record<string, string>>;
  customRecordTypes?: CustomRecordType[];
} | null | undefined;

type IconResolverConfig = {
  recordTypeIcons?: Partial<Record<string, string>>;
  customRecordTypes?: CustomRecordType[];
} | null | undefined;

/** Returns the customized label for a record type. Resolution order:
 *  1) Per-installation label override (admin renamed a default type)
 *  2) Custom record type label (if `type` is a custom key)
 *  3) Built-in RECORD_TYPE_CONFIG label
 *  4) The raw type string (so unknown custom keys still render readable)
 */
export function getRecordTypeLabel(
  type: AccessRecordType,
  config?: LabelResolverConfig,
): string {
  const override = config?.recordTypeLabels?.[type];
  if (override && override.trim().length > 0) return override;
  const custom = config?.customRecordTypes?.find((t) => t.key === type);
  if (custom?.label) return custom.label;
  if (isDefaultRecordType(type)) return RECORD_TYPE_CONFIG[type]?.label ?? type;
  return type;
}

/** Returns the icon name (lucide) to use for a record type. Same resolution
 *  order as `getRecordTypeLabel`. Returns a string so the component layer
 *  can map it to a React element (icons are not safe to embed in shared
 *  types — they would pull React into server bundles). */
export function getRecordTypeIconName(
  type: AccessRecordType,
  config?: IconResolverConfig,
): string {
  const override = config?.recordTypeIcons?.[type];
  if (override && override.trim().length > 0) return override;
  const custom = config?.customRecordTypes?.find((t) => t.key === type);
  if (custom?.icon) return custom.icon;
  if (isDefaultRecordType(type)) return RECORD_TYPE_CONFIG[type]?.icon ?? "UserPlus";
  return "UserPlus";
}

type ScanModeResolverConfig = {
  customRecordTypes?: CustomRecordType[];
  recordTypeScanModes?: Partial<Record<string, ScanMode[]>>;
} | null | undefined;

/** Modos de escaneo habilitados para un tipo (orden importa: el primero
 *  es el sugerido por defecto en el UI cuando hay varios).
 *  Resolución: override por installation → custom.scanModes → custom.scanMode
 *  legacy → default fijo (vehicle=plate, otros=rut, none=[none]). */
export function getRecordTypeScanModes(
  type: AccessRecordType,
  config?: ScanModeResolverConfig,
): ScanMode[] {
  const override = config?.recordTypeScanModes?.[type];
  if (override && override.length > 0) return override;
  const custom = config?.customRecordTypes?.find((t) => t.key === type);
  if (custom?.scanModes && custom.scanModes.length > 0) return custom.scanModes;
  if (custom?.scanMode) return [custom.scanMode];
  if (isDefaultRecordType(type)) return type === "vehicle" ? ["plate"] : ["rut"];
  return ["none"];
}

/** @deprecated usar getRecordTypeScanModes (plural). Wrapper que retorna
 *  el primer modo habilitado para no romper consumidores existentes. */
export function getRecordTypeScanMode(
  type: AccessRecordType,
  config?: ScanModeResolverConfig,
): ScanMode {
  const modes = getRecordTypeScanModes(type, config);
  return modes[0] ?? "none";
}

/** Combina los seed fields de varios scan modes deduplicando por `field`.
 *  Preserva el orden de aparición y reordena al final con `order` ascendente.
 *  Útil para el modal "Nuevo tipo" cuando el admin selecciona ambos
 *  cédula y patente — se muestran los campos comunes una sola vez. */
export function seedFieldsForScanModes(modes: ScanMode[]): FormFieldConfig[] {
  if (modes.length === 0) return SEED_FIELDS_BY_SCAN_MODE.none;
  const seen = new Set<string>();
  const out: FormFieldConfig[] = [];
  for (const mode of modes) {
    for (const f of SEED_FIELDS_BY_SCAN_MODE[mode]) {
      if (seen.has(f.field)) continue;
      seen.add(f.field);
      out.push(f);
    }
  }
  return out
    .map((f, i) => ({ ...f, order: i + 1 }));
}

export const PREREGISTRATION_STATUS_CONFIG: Record<PreregistrationStatus, { label: string; color: string }> = {
  pending: { label: "Pendiente", color: "yellow" },
  checked_in: { label: "Ingresó", color: "green" },
  checked_out: { label: "Salió", color: "blue" },
  no_show: { label: "No se presentó", color: "red" },
  cancelled: { label: "Cancelado", color: "gray" },
};

/** Default form fields for each built-in record type. Custom types take
 *  their initial fields from the CustomRecordType.defaultFields column. */
export const DEFAULT_FORM_FIELDS: Record<DefaultRecordTypeId, FormFieldConfig[]> = {
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
