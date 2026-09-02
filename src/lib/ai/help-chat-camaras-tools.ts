/**
 * Tools MCP / help-chat para Cámaras IP (add-on `ops_camaras`).
 * Wrappers sobre `src/lib/camaras/*` — el mismo camino que
 * `/api/ops/camaras` y el tab Cámaras de la instalación. No hay
 * un producto paralelo: alta, edición, baja lógica, prueba de
 * stream, PTZ y páginas del video wall reutilizan mutate/live/layouts.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/api-auth";
import {
  canEdit,
  canView,
  hasCapability,
  hasModuleAccess,
  type RolePermissions,
} from "@/lib/permissions";
import { isTenantModuleEnabled } from "@/lib/tenant-modules";
import { isUuid } from "@/lib/utils/uuid";
import { BRAND_PROFILES } from "@/lib/camaras/brand-profiles";
import {
  createCamaraLayout,
  deleteCamaraLayout,
  listCamaraLayouts,
  updateCamaraLayout,
} from "@/lib/camaras/layouts";
import { runCamaraPtz, testCamaraConnection } from "@/lib/camaras/live";
import { assertInstallation, createCamara, deactivateCamara, getCamara, updateCamara } from "@/lib/camaras/mutate";
import { listCamaras } from "@/lib/camaras/repo";
import { createCamaraSchema, layoutPatchSchema, layoutSchema, ptzSchema, updateCamaraSchema } from "@/lib/camaras/schemas";
import { serializeCamara } from "@/lib/camaras/serialize";
import { CAMERA_BRANDS, SOURCE_TYPES, STREAM_QUALITIES } from "@/lib/camaras/types";

type ToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

function denied(msg: string) {
  return { ok: false as const, error: msg };
}

function redactArgs(args: Record<string, unknown>): Record<string, unknown> {
  if (!("password" in args)) return args;
  return { ...args, password: "[redacted]" };
}

async function logAiAction(opts: {
  tenantId: string;
  userId: string;
  toolName: string;
  args: unknown;
  status: "success" | "denied" | "validation_error" | "internal_error";
  resultEntityId?: string;
  resultEntityType?: string;
  errorMessage?: string;
  startedAt: number;
}) {
  try {
    await prisma.aiActionLog.create({
      data: {
        tenantId: opts.tenantId,
        userId: opts.userId,
        toolName: opts.toolName,
        args: redactArgs((opts.args ?? {}) as Record<string, unknown>) as Prisma.InputJsonValue,
        status: opts.status,
        resultEntityId: opts.resultEntityId ?? null,
        resultEntityType: opts.resultEntityType ?? null,
        errorMessage: opts.errorMessage ?? null,
        durationMs: Date.now() - opts.startedAt,
      },
    });
  } catch (e) {
    console.error("[help-chat-camaras] logAiAction falló", e);
  }
}

async function requireCamarasModule(tenantId: string) {
  if (!(await isTenantModuleEnabled(tenantId, "ops_camaras"))) {
    return denied(
      "El módulo ops_camaras no está habilitado en este tenant. Actívalo como add-on Cámaras IP.",
    );
  }
  return null;
}

function requireCamarasView(perms: RolePermissions) {
  if (!hasModuleAccess(perms, "ops") || !canView(perms, "ops", "camaras")) {
    return denied("Sin permiso para ver cámaras (ops.camaras).");
  }
  return null;
}

function requireCamarasConfigure(perms: RolePermissions) {
  const view = requireCamarasView(perms);
  if (view) return view;
  if (!canEdit(perms, "ops", "camaras") || !hasCapability(perms, "camaras_configure")) {
    return denied("Sin permiso para configurar cámaras (camaras_configure).");
  }
  return null;
}

async function authContext(tenantId: string, userId: string): Promise<AuthContext> {
  const admin = await prisma.admin.findFirst({
    where: { id: userId, tenantId },
    select: { email: true, role: true },
  });
  return {
    userId,
    tenantId,
    userEmail: admin?.email ?? "",
    userRole: admin?.role ?? "viewer",
  };
}

const CAMERA_FIELD_PROPS = {
  name: { type: "string", description: "Nombre visible de la cámara (máx. 120)." },
  sourceType: {
    type: "string",
    enum: [...SOURCE_TYPES],
    description: "nvr = canal de un NVR; camera = cámara IP directa. Default nvr.",
  },
  brand: {
    type: "string",
    enum: [...CAMERA_BRANDS],
    description: "Marca para armar el path RTSP. Usa list_camera_brands. Default generic.",
  },
  host: { type: "string", description: "IP o hostname del NVR/cámara." },
  rtspPort: { type: "integer", description: "Puerto RTSP. Si se omite, usa el default de la marca (casi siempre 554)." },
  onvifPort: {
    type: ["integer", "null"],
    description: "Puerto ONVIF para PTZ. null desactiva. Default según marca.",
  },
  channel: { type: "integer", description: "Canal 1–256. Default 1." },
  streamQuality: {
    type: "string",
    enum: [...STREAM_QUALITIES],
    description: "main = alta; sub = substream (recomendado para wall). Default sub.",
  },
  customPath: {
    type: ["string", "null"],
    description: "Path RTSP custom. Solo aplica si brand=generic.",
  },
  username: { type: "string", description: "Usuario RTSP/ONVIF. Preferir cuenta de solo visualización, no admin." },
  password: { type: "string", description: "Password en claro. Se cifra en servidor; nunca se devuelve." },
  ptzCapable: { type: "boolean", description: "Si la cámara acepta PTZ ONVIF." },
  notes: { type: ["string", "null"], description: "Notas internas (máx. 500)." },
  sortOrder: { type: "integer", description: "Orden en el wall." },
} as const;

export function camarasReadToolDefinitions(): ToolDef[] {
  return [
    {
      type: "function",
      function: {
        name: "list_cameras",
        description:
          "Lista cámaras IP del tenant (add-on ops_camaras). Incluye estado de stream (untested/online/offline/error), " +
          "host/canal/marca, instalación y lastError. Nunca devuelve password. Filtra por installationId, accountId, " +
          "texto (nombre/host) o includeInactive. Si el usuario nombra una instalación, llama search_installations primero.",
        parameters: {
          type: "object",
          properties: {
            installationId: { type: "string", description: "UUID de la instalación CRM." },
            accountId: { type: "string", description: "UUID de la cuenta/cliente CRM." },
            query: { type: "string", description: "Filtro por nombre o host." },
            includeInactive: {
              type: "boolean",
              description: "true incluye cámaras dadas de baja (isActive=false). Default false.",
            },
            limit: { type: "integer", description: "Máximo 100. Default 50." },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_camera",
        description:
          "Obtiene una cámara por UUID: RTSP/ONVIF (host, puertos, canal, brand, streamQuality, customPath, username), " +
          "vínculo a instalación, isActive y salud del stream (status, lastSeenAt, lastError). Nunca incluye password. " +
          "Si solo tienes el nombre, usa list_cameras.",
        parameters: {
          type: "object",
          properties: {
            cameraId: { type: "string", description: "UUID de la cámara. OBLIGATORIO." },
          },
          required: ["cameraId"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "list_camera_brands",
        description:
          "Catálogo de marcas soportadas para create_camera (hikvision, dahua, uniview, tplink_vigi, hanwha, axis, generic) " +
          "con puertos RTSP/ONVIF por defecto y si PTZ va por ONVIF. Úsalo antes de dar de alta si el usuario dice la marca.",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      },
    },
    {
      type: "function",
      function: {
        name: "list_camera_layouts",
        description:
          "Lista las páginas del video wall del operador actual (nombre, grid 1/4/9/16, cameraIds). " +
          "Son layouts por usuario, no globales del tenant.",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      },
    },
  ];
}

export function camarasWriteToolDefinitions(): ToolDef[] {
  return [
    {
      type: "function",
      function: {
        name: "create_camera",
        description:
          "Da de alta una cámara IP en una instalación (mismo path que POST /api/ops/camaras). " +
          "Requiere installationId (UUID; obténlo con search_installations), name, host, username y password. " +
          "Opcional: brand, sourceType, channel, rtspPort, onvifPort, streamQuality, customPath, ptzCapable, notes. " +
          "Registra el stream RTSP en el relay go2rtc. Nunca pidas ni reenvíes el password después de crearla.",
        parameters: {
          type: "object",
          properties: {
            installationId: {
              type: "string",
              description: "UUID de la instalación. OBLIGATORIO. Usa search_installations si solo tienes el nombre.",
            },
            ...CAMERA_FIELD_PROPS,
          },
          required: ["installationId", "name", "host", "username", "password"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "update_camera",
        description:
          "Actualiza una cámara existente (PATCH /api/ops/camaras/:id). Patch parcial. " +
          "isActive true/false habilita o deshabilita sin borrar. Si cambias host/puerto/canal/brand/password " +
          "se re-registra el stream en el relay. installationId no se puede mover (da de baja y crea otra). " +
          "Password opcional: solo envíalo si hay que rotarlo.",
        parameters: {
          type: "object",
          properties: {
            cameraId: { type: "string", description: "UUID de la cámara. OBLIGATORIO." },
            isActive: { type: "boolean", description: "false deshabilita el stream; true lo reactiva." },
            ...CAMERA_FIELD_PROPS,
          },
          required: ["cameraId"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "delete_camera",
        description:
          "Da de baja lógica una cámara (DELETE /api/ops/camaras/:id): isActive=false, status=offline y quita el stream del relay. " +
          "No borra el historial. Para reactivar usa update_camera con isActive=true.",
        parameters: {
          type: "object",
          properties: {
            cameraId: { type: "string", description: "UUID de la cámara. OBLIGATORIO." },
          },
          required: ["cameraId"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "test_camera_connection",
        description:
          "Prueba la conexión RTSP vía relay (POST /api/ops/camaras/:id/test): re-registra el stream y pide un snapshot. " +
          "Actualiza status (online/offline/error), lastSeenAt y lastError. Devuelve salud, no el JPEG.",
        parameters: {
          type: "object",
          properties: {
            cameraId: { type: "string", description: "UUID de la cámara. OBLIGATORIO." },
          },
          required: ["cameraId"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "ptz_camera",
        description:
          "PTZ ONVIF best-effort (POST /api/ops/camaras/:id/ptz). action=move con pan/tilt/zoom en [-1,1], o action=stop. " +
          "Requiere ptzCapable=true. Si la cámara no expone ONVIF, error PTZ no disponible.",
        parameters: {
          type: "object",
          properties: {
            cameraId: { type: "string", description: "UUID de la cámara. OBLIGATORIO." },
            action: { type: "string", enum: ["move", "stop"], description: "move o stop. OBLIGATORIO." },
            pan: { type: "number", description: "Velocidad horizontal -1..1. Solo action=move." },
            tilt: { type: "number", description: "Velocidad vertical -1..1. Solo action=move." },
            zoom: { type: "number", description: "Velocidad zoom -1..1. Solo action=move." },
          },
          required: ["cameraId", "action"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "create_camera_layout",
        description:
          "Crea una página del video wall del operador actual (POST /api/ops/camaras/layouts). " +
          "gridSize 1, 4, 9 o 16. cameraIds son UUIDs de cámaras activas del tenant (máx. 16).",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "Nombre de la página. OBLIGATORIO." },
            gridSize: { type: "integer", enum: [1, 4, 9, 16], description: "Tamaño de grilla. Default 4." },
            cameraIds: {
              type: "array",
              items: { type: "string" },
              description: "UUIDs de cámaras activas, máx. 16.",
            },
            sortOrder: { type: "integer" },
          },
          required: ["name"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "update_camera_layout",
        description: "Actualiza una página del video wall del operador (PATCH /api/ops/camaras/layouts/:id).",
        parameters: {
          type: "object",
          properties: {
            layoutId: { type: "string", description: "UUID de la página. OBLIGATORIO." },
            name: { type: "string" },
            gridSize: { type: "integer", enum: [1, 4, 9, 16] },
            cameraIds: { type: "array", items: { type: "string" } },
            sortOrder: { type: "integer" },
          },
          required: ["layoutId"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "delete_camera_layout",
        description: "Elimina una página del video wall del operador (DELETE /api/ops/camaras/layouts/:id).",
        parameters: {
          type: "object",
          properties: {
            layoutId: { type: "string", description: "UUID de la página. OBLIGATORIO." },
          },
          required: ["layoutId"],
          additionalProperties: false,
        },
      },
    },
  ];
}

export const CAMARAS_WRITE_TOOL_LABELS: Record<string, string> = {
  create_camera: "Crear cámara IP",
  update_camera: "Actualizar cámara IP",
  delete_camera: "Dar de baja cámara IP",
  test_camera_connection: "Probar conexión de cámara",
  ptz_camera: "Mover PTZ de cámara",
  create_camera_layout: "Crear página del video wall",
  update_camera_layout: "Actualizar página del video wall",
  delete_camera_layout: "Eliminar página del video wall",
};

export async function toolListCameras(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
) {
  const t0 = Date.now();
  const mod = await requireCamarasModule(tenantId);
  if (mod) {
    await logAiAction({ tenantId, userId, toolName: "list_cameras", args, status: "denied", errorMessage: mod.error, startedAt: t0 });
    return mod;
  }
  const view = requireCamarasView(perms);
  if (view) {
    await logAiAction({ tenantId, userId, toolName: "list_cameras", args, status: "denied", errorMessage: view.error, startedAt: t0 });
    return view;
  }
  try {
    const rows = await listCamaras(tenantId, {
      installationId: typeof args.installationId === "string" ? args.installationId : undefined,
      accountId: typeof args.accountId === "string" ? args.accountId : undefined,
      query: typeof args.query === "string" ? args.query : undefined,
      includeInactive: args.includeInactive === true,
      limit: typeof args.limit === "number" ? args.limit : undefined,
    });
    await logAiAction({ tenantId, userId, toolName: "list_cameras", args, status: "success", startedAt: t0 });
    return {
      ok: true,
      data: rows.map((c) => serializeCamara(c)),
      count: rows.length,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al listar cámaras";
    await logAiAction({ tenantId, userId, toolName: "list_cameras", args, status: "internal_error", errorMessage: msg, startedAt: t0 });
    return denied(msg);
  }
}

export async function toolGetCamera(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
) {
  const t0 = Date.now();
  const mod = await requireCamarasModule(tenantId);
  if (mod) {
    await logAiAction({ tenantId, userId, toolName: "get_camera", args, status: "denied", errorMessage: mod.error, startedAt: t0 });
    return mod;
  }
  const view = requireCamarasView(perms);
  if (view) {
    await logAiAction({ tenantId, userId, toolName: "get_camera", args, status: "denied", errorMessage: view.error, startedAt: t0 });
    return view;
  }
  const cameraId = typeof args.cameraId === "string" ? args.cameraId.trim() : "";
  if (!isUuid(cameraId)) {
    await logAiAction({ tenantId, userId, toolName: "get_camera", args, status: "validation_error", errorMessage: "cameraId inválido", startedAt: t0 });
    return denied("cameraId inválido. Usa list_cameras para obtener el UUID.");
  }
  try {
    const row = await getCamara(tenantId, cameraId);
    if (!row) {
      await logAiAction({ tenantId, userId, toolName: "get_camera", args, status: "validation_error", errorMessage: "no encontrada", startedAt: t0 });
      return denied("Cámara no encontrada.");
    }
    await logAiAction({
      tenantId, userId, toolName: "get_camera", args, status: "success",
      resultEntityId: row.id, resultEntityType: "ops_camara", startedAt: t0,
    });
    return { ok: true, data: serializeCamara(row) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al obtener la cámara";
    await logAiAction({ tenantId, userId, toolName: "get_camera", args, status: "internal_error", errorMessage: msg, startedAt: t0 });
    return denied(msg);
  }
}

export async function toolListCameraBrands(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
) {
  const t0 = Date.now();
  const args = {};
  const mod = await requireCamarasModule(tenantId);
  if (mod) {
    await logAiAction({ tenantId, userId, toolName: "list_camera_brands", args, status: "denied", errorMessage: mod.error, startedAt: t0 });
    return mod;
  }
  const view = requireCamarasView(perms);
  if (view) {
    await logAiAction({ tenantId, userId, toolName: "list_camera_brands", args, status: "denied", errorMessage: view.error, startedAt: t0 });
    return view;
  }
  const data = CAMERA_BRANDS.map((brand) => {
    const profile = BRAND_PROFILES[brand];
    return {
      brand,
      label: profile.label,
      rtspPort: profile.rtspPort,
      onvifPort: profile.onvifPort,
      ptzViaOnvif: profile.ptzViaOnvif,
      exampleMainPath: profile.mainPath(1),
      exampleSubPath: profile.subPath(1),
    };
  });
  await logAiAction({ tenantId, userId, toolName: "list_camera_brands", args, status: "success", startedAt: t0 });
  return { ok: true, data };
}

export async function toolListCameraLayouts(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
) {
  const t0 = Date.now();
  const args = {};
  const mod = await requireCamarasModule(tenantId);
  if (mod) {
    await logAiAction({ tenantId, userId, toolName: "list_camera_layouts", args, status: "denied", errorMessage: mod.error, startedAt: t0 });
    return mod;
  }
  const view = requireCamarasView(perms);
  if (view) {
    await logAiAction({ tenantId, userId, toolName: "list_camera_layouts", args, status: "denied", errorMessage: view.error, startedAt: t0 });
    return view;
  }
  try {
    const data = await listCamaraLayouts(tenantId, userId);
    await logAiAction({ tenantId, userId, toolName: "list_camera_layouts", args, status: "success", startedAt: t0 });
    return { ok: true, data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al listar páginas";
    await logAiAction({ tenantId, userId, toolName: "list_camera_layouts", args, status: "internal_error", errorMessage: msg, startedAt: t0 });
    return denied(msg);
  }
}

export async function toolCreateCamera(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
) {
  const t0 = Date.now();
  const mod = await requireCamarasModule(tenantId);
  if (mod) {
    await logAiAction({ tenantId, userId, toolName: "create_camera", args, status: "denied", errorMessage: mod.error, startedAt: t0 });
    return mod;
  }
  const cfg = requireCamarasConfigure(perms);
  if (cfg) {
    await logAiAction({ tenantId, userId, toolName: "create_camera", args, status: "denied", errorMessage: cfg.error, startedAt: t0 });
    return cfg;
  }
  const parsed = createCamaraSchema.safeParse(args);
  if (!parsed.success) {
    const msg = JSON.stringify(parsed.error.flatten().fieldErrors);
    await logAiAction({ tenantId, userId, toolName: "create_camera", args, status: "validation_error", errorMessage: msg, startedAt: t0 });
    return denied(`Datos inválidos: ${msg}`);
  }
  try {
    const ctx = await authContext(tenantId, userId);
    const inst = await assertInstallation(tenantId, parsed.data.installationId);
    if (!inst) {
      await logAiAction({ tenantId, userId, toolName: "create_camera", args, status: "validation_error", errorMessage: "instalación no encontrada", startedAt: t0 });
      return denied("Instalación no encontrada. Usa search_installations para obtener el UUID.");
    }
    const result = await createCamara(ctx, parsed.data);
    await logAiAction({
      tenantId, userId, toolName: "create_camera", args, status: "success",
      resultEntityId: result.camera.id, resultEntityType: "ops_camara", startedAt: t0,
    });
    return { ok: true, ...result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al crear cámara";
    await logAiAction({ tenantId, userId, toolName: "create_camera", args, status: "internal_error", errorMessage: msg, startedAt: t0 });
    return denied(msg);
  }
}

export async function toolUpdateCamera(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
) {
  const t0 = Date.now();
  const mod = await requireCamarasModule(tenantId);
  if (mod) {
    await logAiAction({ tenantId, userId, toolName: "update_camera", args, status: "denied", errorMessage: mod.error, startedAt: t0 });
    return mod;
  }
  const cfg = requireCamarasConfigure(perms);
  if (cfg) {
    await logAiAction({ tenantId, userId, toolName: "update_camera", args, status: "denied", errorMessage: cfg.error, startedAt: t0 });
    return cfg;
  }
  const cameraId = typeof args.cameraId === "string" ? args.cameraId.trim() : "";
  if (!isUuid(cameraId)) {
    await logAiAction({ tenantId, userId, toolName: "update_camera", args, status: "validation_error", errorMessage: "cameraId inválido", startedAt: t0 });
    return denied("cameraId inválido.");
  }
  const patch = { ...args };
  delete patch.cameraId;
  const parsed = updateCamaraSchema.safeParse(patch);
  if (!parsed.success) {
    const msg = JSON.stringify(parsed.error.flatten().fieldErrors);
    await logAiAction({ tenantId, userId, toolName: "update_camera", args, status: "validation_error", errorMessage: msg, startedAt: t0 });
    return denied(`Datos inválidos: ${msg}`);
  }
  try {
    const ctx = await authContext(tenantId, userId);
    const result = await updateCamara(ctx, cameraId, parsed.data);
    if (!result) {
      await logAiAction({ tenantId, userId, toolName: "update_camera", args, status: "validation_error", errorMessage: "no encontrada", startedAt: t0 });
      return denied("Cámara no encontrada.");
    }
    await logAiAction({
      tenantId, userId, toolName: "update_camera", args, status: "success",
      resultEntityId: cameraId, resultEntityType: "ops_camara", startedAt: t0,
    });
    return { ok: true, ...result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al actualizar cámara";
    await logAiAction({ tenantId, userId, toolName: "update_camera", args, status: "internal_error", errorMessage: msg, startedAt: t0 });
    return denied(msg);
  }
}

export async function toolDeleteCamera(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
) {
  const t0 = Date.now();
  const mod = await requireCamarasModule(tenantId);
  if (mod) {
    await logAiAction({ tenantId, userId, toolName: "delete_camera", args, status: "denied", errorMessage: mod.error, startedAt: t0 });
    return mod;
  }
  const cfg = requireCamarasConfigure(perms);
  if (cfg) {
    await logAiAction({ tenantId, userId, toolName: "delete_camera", args, status: "denied", errorMessage: cfg.error, startedAt: t0 });
    return cfg;
  }
  const cameraId = typeof args.cameraId === "string" ? args.cameraId.trim() : "";
  if (!isUuid(cameraId)) {
    await logAiAction({ tenantId, userId, toolName: "delete_camera", args, status: "validation_error", errorMessage: "cameraId inválido", startedAt: t0 });
    return denied("cameraId inválido.");
  }
  try {
    const ctx = await authContext(tenantId, userId);
    const row = await deactivateCamara(ctx, cameraId);
    if (!row) {
      await logAiAction({ tenantId, userId, toolName: "delete_camera", args, status: "validation_error", errorMessage: "no encontrada", startedAt: t0 });
      return denied("Cámara no encontrada.");
    }
    await logAiAction({
      tenantId, userId, toolName: "delete_camera", args, status: "success",
      resultEntityId: cameraId, resultEntityType: "ops_camara", startedAt: t0,
    });
    return { ok: true, data: row };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al dar de baja la cámara";
    await logAiAction({ tenantId, userId, toolName: "delete_camera", args, status: "internal_error", errorMessage: msg, startedAt: t0 });
    return denied(msg);
  }
}

export async function toolTestCameraConnection(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
) {
  const t0 = Date.now();
  const mod = await requireCamarasModule(tenantId);
  if (mod) {
    await logAiAction({ tenantId, userId, toolName: "test_camera_connection", args, status: "denied", errorMessage: mod.error, startedAt: t0 });
    return mod;
  }
  const view = requireCamarasView(perms);
  if (view) {
    await logAiAction({ tenantId, userId, toolName: "test_camera_connection", args, status: "denied", errorMessage: view.error, startedAt: t0 });
    return view;
  }
  const cameraId = typeof args.cameraId === "string" ? args.cameraId.trim() : "";
  if (!isUuid(cameraId)) {
    await logAiAction({ tenantId, userId, toolName: "test_camera_connection", args, status: "validation_error", errorMessage: "cameraId inválido", startedAt: t0 });
    return denied("cameraId inválido.");
  }
  try {
    const result = await testCamaraConnection(tenantId, cameraId);
    if ("notFound" in result) {
      await logAiAction({ tenantId, userId, toolName: "test_camera_connection", args, status: "validation_error", errorMessage: "no encontrada", startedAt: t0 });
      return denied("Cámara no encontrada o inactiva.");
    }
    await logAiAction({
      tenantId, userId, toolName: "test_camera_connection", args, status: "success",
      resultEntityId: cameraId, resultEntityType: "ops_camara", startedAt: t0,
    });
    const snapshotAvailable =
      "dataUrl" in result && typeof (result as { dataUrl?: unknown }).dataUrl === "string";
    const rest = { ...result } as Record<string, unknown>;
    delete rest.dataUrl;
    return {
      ok: !("error" in result),
      snapshotAvailable,
      ...rest,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al probar la cámara";
    await logAiAction({ tenantId, userId, toolName: "test_camera_connection", args, status: "internal_error", errorMessage: msg, startedAt: t0 });
    return denied(msg);
  }
}

export async function toolPtzCamera(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
) {
  const t0 = Date.now();
  const mod = await requireCamarasModule(tenantId);
  if (mod) {
    await logAiAction({ tenantId, userId, toolName: "ptz_camera", args, status: "denied", errorMessage: mod.error, startedAt: t0 });
    return mod;
  }
  const view = requireCamarasView(perms);
  if (view) {
    await logAiAction({ tenantId, userId, toolName: "ptz_camera", args, status: "denied", errorMessage: view.error, startedAt: t0 });
    return view;
  }
  const cameraId = typeof args.cameraId === "string" ? args.cameraId.trim() : "";
  if (!isUuid(cameraId)) {
    await logAiAction({ tenantId, userId, toolName: "ptz_camera", args, status: "validation_error", errorMessage: "cameraId inválido", startedAt: t0 });
    return denied("cameraId inválido.");
  }
  const parsed = ptzSchema.safeParse({
    action: args.action,
    pan: args.pan,
    tilt: args.tilt,
    zoom: args.zoom,
  });
  if (!parsed.success) {
    const msg = JSON.stringify(parsed.error.flatten().fieldErrors);
    await logAiAction({ tenantId, userId, toolName: "ptz_camera", args, status: "validation_error", errorMessage: msg, startedAt: t0 });
    return denied(`Datos inválidos: ${msg}`);
  }
  try {
    const result = await runCamaraPtz(tenantId, cameraId, parsed.data);
    if ("notFound" in result) {
      await logAiAction({ tenantId, userId, toolName: "ptz_camera", args, status: "validation_error", errorMessage: "no encontrada", startedAt: t0 });
      return denied("Cámara no encontrada o inactiva.");
    }
    if ("error" in result) {
      const message = result.error ?? "PTZ no disponible";
      await logAiAction({ tenantId, userId, toolName: "ptz_camera", args, status: "validation_error", errorMessage: message, startedAt: t0 });
      return denied(message);
    }
    await logAiAction({
      tenantId, userId, toolName: "ptz_camera", args, status: "success",
      resultEntityId: cameraId, resultEntityType: "ops_camara", startedAt: t0,
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error PTZ";
    await logAiAction({ tenantId, userId, toolName: "ptz_camera", args, status: "internal_error", errorMessage: msg, startedAt: t0 });
    return denied(msg);
  }
}

export async function toolCreateCameraLayout(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
) {
  const t0 = Date.now();
  const mod = await requireCamarasModule(tenantId);
  if (mod) {
    await logAiAction({ tenantId, userId, toolName: "create_camera_layout", args, status: "denied", errorMessage: mod.error, startedAt: t0 });
    return mod;
  }
  const view = requireCamarasView(perms);
  if (view) {
    await logAiAction({ tenantId, userId, toolName: "create_camera_layout", args, status: "denied", errorMessage: view.error, startedAt: t0 });
    return view;
  }
  const parsed = layoutSchema.safeParse(args);
  if (!parsed.success) {
    const msg = JSON.stringify(parsed.error.flatten().fieldErrors);
    await logAiAction({ tenantId, userId, toolName: "create_camera_layout", args, status: "validation_error", errorMessage: msg, startedAt: t0 });
    return denied(`Datos inválidos: ${msg}`);
  }
  try {
    const row = await createCamaraLayout(tenantId, userId, parsed.data);
    await logAiAction({
      tenantId, userId, toolName: "create_camera_layout", args, status: "success",
      resultEntityId: row.id, resultEntityType: "ops_camara_layout", startedAt: t0,
    });
    return { ok: true, data: row };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al guardar la página";
    await logAiAction({ tenantId, userId, toolName: "create_camera_layout", args, status: "internal_error", errorMessage: msg, startedAt: t0 });
    return denied(msg);
  }
}

export async function toolUpdateCameraLayout(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
) {
  const t0 = Date.now();
  const mod = await requireCamarasModule(tenantId);
  if (mod) {
    await logAiAction({ tenantId, userId, toolName: "update_camera_layout", args, status: "denied", errorMessage: mod.error, startedAt: t0 });
    return mod;
  }
  const view = requireCamarasView(perms);
  if (view) {
    await logAiAction({ tenantId, userId, toolName: "update_camera_layout", args, status: "denied", errorMessage: view.error, startedAt: t0 });
    return view;
  }
  const layoutId = typeof args.layoutId === "string" ? args.layoutId.trim() : "";
  if (!isUuid(layoutId)) {
    await logAiAction({ tenantId, userId, toolName: "update_camera_layout", args, status: "validation_error", errorMessage: "layoutId inválido", startedAt: t0 });
    return denied("layoutId inválido.");
  }
  const patch = { ...args };
  delete patch.layoutId;
  const parsed = layoutPatchSchema.safeParse(patch);
  if (!parsed.success) {
    const msg = JSON.stringify(parsed.error.flatten().fieldErrors);
    await logAiAction({ tenantId, userId, toolName: "update_camera_layout", args, status: "validation_error", errorMessage: msg, startedAt: t0 });
    return denied(`Datos inválidos: ${msg}`);
  }
  try {
    const row = await updateCamaraLayout(tenantId, userId, layoutId, parsed.data);
    if (!row) {
      await logAiAction({ tenantId, userId, toolName: "update_camera_layout", args, status: "validation_error", errorMessage: "no encontrada", startedAt: t0 });
      return denied("Página no encontrada.");
    }
    await logAiAction({
      tenantId, userId, toolName: "update_camera_layout", args, status: "success",
      resultEntityId: layoutId, resultEntityType: "ops_camara_layout", startedAt: t0,
    });
    return { ok: true, data: row };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al actualizar la página";
    await logAiAction({ tenantId, userId, toolName: "update_camera_layout", args, status: "internal_error", errorMessage: msg, startedAt: t0 });
    return denied(msg);
  }
}

export async function toolDeleteCameraLayout(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
) {
  const t0 = Date.now();
  const mod = await requireCamarasModule(tenantId);
  if (mod) {
    await logAiAction({ tenantId, userId, toolName: "delete_camera_layout", args, status: "denied", errorMessage: mod.error, startedAt: t0 });
    return mod;
  }
  const view = requireCamarasView(perms);
  if (view) {
    await logAiAction({ tenantId, userId, toolName: "delete_camera_layout", args, status: "denied", errorMessage: view.error, startedAt: t0 });
    return view;
  }
  const layoutId = typeof args.layoutId === "string" ? args.layoutId.trim() : "";
  if (!isUuid(layoutId)) {
    await logAiAction({ tenantId, userId, toolName: "delete_camera_layout", args, status: "validation_error", errorMessage: "layoutId inválido", startedAt: t0 });
    return denied("layoutId inválido.");
  }
  try {
    const ok = await deleteCamaraLayout(tenantId, userId, layoutId);
    if (!ok) {
      await logAiAction({ tenantId, userId, toolName: "delete_camera_layout", args, status: "validation_error", errorMessage: "no encontrada", startedAt: t0 });
      return denied("Página no encontrada.");
    }
    await logAiAction({
      tenantId, userId, toolName: "delete_camera_layout", args, status: "success",
      resultEntityId: layoutId, resultEntityType: "ops_camara_layout", startedAt: t0,
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al eliminar la página";
    await logAiAction({ tenantId, userId, toolName: "delete_camera_layout", args, status: "internal_error", errorMessage: msg, startedAt: t0 });
    return denied(msg);
  }
}

const CAMARAS_TOOL_NAMES = new Set([
  "list_cameras",
  "get_camera",
  "list_camera_brands",
  "list_camera_layouts",
  "create_camera",
  "update_camera",
  "delete_camera",
  "test_camera_connection",
  "ptz_camera",
  "create_camera_layout",
  "update_camera_layout",
  "delete_camera_layout",
]);

export async function executeCamarasTool(
  toolName: string,
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown | null> {
  if (!CAMARAS_TOOL_NAMES.has(toolName)) return null;
  switch (toolName) {
    case "list_cameras":
      return toolListCameras(tenantId, userId, perms, args);
    case "get_camera":
      return toolGetCamera(tenantId, userId, perms, args);
    case "list_camera_brands":
      return toolListCameraBrands(tenantId, userId, perms);
    case "list_camera_layouts":
      return toolListCameraLayouts(tenantId, userId, perms);
    case "create_camera":
      return toolCreateCamera(tenantId, userId, perms, args);
    case "update_camera":
      return toolUpdateCamera(tenantId, userId, perms, args);
    case "delete_camera":
      return toolDeleteCamera(tenantId, userId, perms, args);
    case "test_camera_connection":
      return toolTestCameraConnection(tenantId, userId, perms, args);
    case "ptz_camera":
      return toolPtzCamera(tenantId, userId, perms, args);
    case "create_camera_layout":
      return toolCreateCameraLayout(tenantId, userId, perms, args);
    case "update_camera_layout":
      return toolUpdateCameraLayout(tenantId, userId, perms, args);
    case "delete_camera_layout":
      return toolDeleteCameraLayout(tenantId, userId, perms, args);
    default:
      return null;
  }
}
