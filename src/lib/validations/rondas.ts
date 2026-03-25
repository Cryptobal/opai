import { z } from "zod";

const hhmmRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const checkpointSchema = z.object({
  installationId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  instrucciones: z.string().trim().max(500).optional().nullable(),
  qrCode: z.string().trim().min(4).max(32).optional().nullable(),
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
  geoRadiusM: z.number().int().min(5).max(50).default(30),
  verificationType: z.enum(["GEOFENCE", "QR", "BOTH"]).default("GEOFENCE"),
  isCritical: z.boolean().default(false),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().optional().default(true),
});

export const rondaTemplateSchema = z.object({
  installationId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  orderMode: z.enum(["strict", "flexible"]).default("flexible"),
  estimatedDurationMin: z.number().int().min(1).max(720).optional().nullable(),
  qrRequerido: z.boolean().default(false),
  checkpointIds: z.array(z.string().uuid()).min(1),
});

export const rondaProgramacionSchema = z.object({
  rondaTemplateId: z.string().uuid(),
  diasSemana: z.array(z.number().int().min(0).max(6)).min(1),
  horaInicio: z.string().regex(hhmmRegex),
  horaFin: z.string().regex(hhmmRegex),
  frecuenciaMinutos: z.number().int().min(30).max(360).default(120),
  horariosCustom: z.array(z.string().regex(hhmmRegex)).min(1).nullable().optional(),
  toleranciaMinutos: z.number().int().min(0).max(120).default(10),
  isActive: z.boolean().default(true),
});

export const rondaStartSchema = z.object({
  ejecucionId: z.string().uuid(),
  deviceInfo: z.record(z.string(), z.unknown()).optional(),
});

export const rondaMarkSchema = z.object({
  executionId: z.string().uuid(),
  checkpointQrCode: z.string().min(1).optional(),
  checkpointId: z.string().uuid().optional(),
  lat: z.number(),
  lng: z.number(),
  gpsAccuracy: z.number().optional().nullable(),
  batteryLevel: z.number().int().min(0).max(100).optional().nullable(),
  motionData: z.record(z.string(), z.unknown()).optional().nullable(),
  fotoEvidenciaUrl: z.string().optional().nullable(),
  audioUrl: z.string().optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
  verificationMethod: z.enum(["GEOFENCE", "QR", "MANUAL"]).optional(),
  deviceFingerprint: z.string().optional().nullable(),
  isOfflineSync: z.boolean().default(false),
}).refine(d => d.checkpointQrCode || d.checkpointId, {
  message: "checkpointQrCode or checkpointId is required",
});

export const rondaCompleteSchema = z.object({
  executionId: z.string().uuid(),
  notes: z.string().max(2000).optional().nullable(),
});

export const rondaSyncSchema = z.object({
  rounds: z.array(z.object({
    templateId: z.string().uuid(),
    installationId: z.string().uuid(),
    guardiaId: z.string().uuid(),
    scheduleId: z.string().uuid().optional().nullable(),
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime(),
    notes: z.string().optional().nullable(),
    marcaciones: z.array(z.object({
      checkpointId: z.string().uuid(),
      lat: z.number(),
      lng: z.number(),
      gpsAccuracy: z.number().optional().nullable(),
      verificationMethod: z.enum(["GEOFENCE", "QR", "MANUAL"]).default("GEOFENCE"),
      marcadoAt: z.string().datetime(),
      photoUrl: z.string().optional().nullable(),
      audioUrl: z.string().optional().nullable(),
      note: z.string().optional().nullable(),
      batteryLevel: z.number().int().min(0).max(100).optional().nullable(),
      motionData: z.record(z.string(), z.unknown()).optional().nullable(),
    })),
  })).min(1),
});

export const dispositivoSchema = z.object({
  installationId: z.string().uuid(),
  deviceId: z.string().min(1).max(256),
  deviceName: z.string().max(120).optional().nullable(),
});

export const patrolLoginSchema = z.object({
  rut: z.string().min(1),
  pin: z.string().min(4).max(6),
  installationId: z.string().uuid(),
  deviceId: z.string().optional().nullable(),
});

export const monitoreoTurnoCloseSchema = z.object({
  operatorComments: z.string().max(5000).optional().nullable(),
  emailRecipients: z.array(z.string().email()).optional(),
});

export const rondaAuthSchema = z.object({
  code: z.string().min(1),
  rut: z.string().min(1),
  pin: z.string().min(4).max(6),
});

// ── Checkpoint Tasks ──

export const checkpointTaskTypes = ["boolean", "checklist", "select", "text", "number", "photo"] as const;

export const checkpointTaskSchema = z.object({
  checkpointId: z.string().uuid(),
  sortOrder: z.number().int().min(0).default(0),
  label: z.string().trim().min(1).max(500),
  type: z.enum(checkpointTaskTypes).default("boolean"),
  required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(200)).optional().nullable(),
  config: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    minPhotos: z.number().int().min(1).max(10).optional(),
    placeholder: z.string().max(200).optional(),
    alertOnValue: z.union([z.string(), z.boolean(), z.number()]).optional(),
  }).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const checkpointTaskReorderSchema = z.object({
  checkpointId: z.string().uuid(),
  taskIds: z.array(z.string().uuid()).min(1),
});

export const checkpointTaskResponseSchema = z.object({
  taskId: z.string().uuid(),
  value: z.union([z.boolean(), z.string(), z.number(), z.array(z.string())]),
  photoUrls: z.array(z.string()).optional().nullable(),
});
