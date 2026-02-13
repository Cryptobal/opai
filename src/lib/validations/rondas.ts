import { z } from "zod";

const hhmmRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const checkpointSchema = z.object({
  installationId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  qrCode: z.string().trim().min(4).max(32).optional().nullable(),
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
  geoRadiusM: z.number().int().min(10).max(500).default(30),
  isActive: z.boolean().optional().default(true),
});

export const rondaTemplateSchema = z.object({
  installationId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  orderMode: z.enum(["strict", "flexible"]).default("flexible"),
  estimatedDurationMin: z.number().int().min(1).max(720).optional().nullable(),
  checkpointIds: z.array(z.string().uuid()).min(1),
});

export const rondaProgramacionSchema = z.object({
  rondaTemplateId: z.string().uuid(),
  diasSemana: z.array(z.number().int().min(0).max(6)).min(1),
  horaInicio: z.string().regex(hhmmRegex),
  horaFin: z.string().regex(hhmmRegex),
  frecuenciaMinutos: z.number().int().min(5).max(360).default(120),
  toleranciaMinutos: z.number().int().min(0).max(120).default(10),
  isActive: z.boolean().default(true),
});

export const rondaStartSchema = z.object({
  ejecucionId: z.string().uuid(),
  deviceInfo: z.record(z.string(), z.unknown()).optional(),
});

export const rondaMarkSchema = z.object({
  executionId: z.string().uuid(),
  checkpointQrCode: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
  batteryLevel: z.number().int().min(0).max(100).optional().nullable(),
  motionData: z.record(z.string(), z.unknown()).optional().nullable(),
  fotoEvidenciaUrl: z.string().optional().nullable(),
  deviceFingerprint: z.string().optional().nullable(),
});

export const rondaCompleteSchema = z.object({
  executionId: z.string().uuid(),
});

export const rondaAuthSchema = z.object({
  code: z.string().min(1),
  rut: z.string().min(1),
  pin: z.string().min(4).max(6),
});
