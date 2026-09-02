import { z } from "zod";
import { CAMERA_BRANDS, GRID_SIZES, SOURCE_TYPES, STREAM_QUALITIES } from "./types";

export const createCamaraSchema = z.object({
  installationId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  sourceType: z.enum(SOURCE_TYPES).default("nvr"),
  brand: z.enum(CAMERA_BRANDS).default("generic"),
  host: z.string().trim().min(1).max(255),
  rtspPort: z.number().int().min(1).max(65535).optional(),
  onvifPort: z.number().int().min(1).max(65535).nullable().optional(),
  channel: z.number().int().min(1).max(256).default(1),
  streamQuality: z.enum(STREAM_QUALITIES).default("sub"),
  customPath: z.string().trim().max(255).nullable().optional(),
  username: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(255),
  ptzCapable: z.boolean().default(false),
  notes: z.string().max(500).nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export const updateCamaraSchema = createCamaraSchema
  .omit({ installationId: true, password: true })
  .partial()
  .extend({
    password: z.string().min(1).max(255).optional(),
    isActive: z.boolean().optional(),
  });

export const relayTokenSchema = z.object({
  cameraIds: z.array(z.string().uuid()).min(1).max(16),
});

export const ptzSchema = z.object({
  action: z.enum(["move", "stop"]),
  pan: z.number().min(-1).max(1).optional(),
  tilt: z.number().min(-1).max(1).optional(),
  zoom: z.number().min(-1).max(1).optional(),
});

export const layoutSchema = z.object({
  name: z.string().trim().min(1).max(80),
  gridSize: z.union([
    z.literal(GRID_SIZES[0]),
    z.literal(GRID_SIZES[1]),
    z.literal(GRID_SIZES[2]),
    z.literal(GRID_SIZES[3]),
  ]).default(4),
  cameraIds: z.array(z.string().uuid()).max(16).default([]),
  sortOrder: z.number().int().optional(),
});
