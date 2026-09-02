import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RolePermissions } from "@/lib/permissions";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    admin: { findFirst: vi.fn() },
    aiActionLog: { create: vi.fn() },
  },
}));

const isTenantModuleEnabledMock = vi.hoisted(() => vi.fn(async () => true));
vi.mock("@/lib/tenant-modules", () => ({
  isTenantModuleEnabled: isTenantModuleEnabledMock,
}));

const listCamarasMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/camaras/repo", () => ({
  listCamaras: listCamarasMock,
}));

const getCamaraMock = vi.hoisted(() => vi.fn());
const createCamaraMock = vi.hoisted(() => vi.fn());
const updateCamaraMock = vi.hoisted(() => vi.fn());
const deactivateCamaraMock = vi.hoisted(() => vi.fn());
const assertInstallationMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/camaras/mutate", () => ({
  getCamara: getCamaraMock,
  createCamara: createCamaraMock,
  updateCamara: updateCamaraMock,
  deactivateCamara: deactivateCamaraMock,
  assertInstallation: assertInstallationMock,
}));

const testCamaraConnectionMock = vi.hoisted(() => vi.fn());
const runCamaraPtzMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/camaras/live", () => ({
  testCamaraConnection: testCamaraConnectionMock,
  runCamaraPtz: runCamaraPtzMock,
}));

const listCamaraLayoutsMock = vi.hoisted(() => vi.fn());
const createCamaraLayoutMock = vi.hoisted(() => vi.fn());
const updateCamaraLayoutMock = vi.hoisted(() => vi.fn());
const deleteCamaraLayoutMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/camaras/layouts", () => ({
  listCamaraLayouts: listCamaraLayoutsMock,
  createCamaraLayout: createCamaraLayoutMock,
  updateCamaraLayout: updateCamaraLayoutMock,
  deleteCamaraLayout: deleteCamaraLayoutMock,
}));

import { prisma } from "@/lib/prisma";
import {
  executeToolCallV2,
  getToolDefinitionsV2,
  WRITE_TOOL_NAMES,
} from "@/lib/ai/help-chat-tools-v2";
import {
  camarasReadToolDefinitions,
  camarasWriteToolDefinitions,
  toolCreateCamera,
  toolDeleteCamera,
  toolGetCamera,
  toolListCameraBrands,
  toolListCameras,
  toolPtzCamera,
  toolTestCameraConnection,
  toolUpdateCamera,
} from "@/lib/ai/help-chat-camaras-tools";
import { MCP_DESTRUCTIVE_TOOL_NAMES } from "@/lib/integrations/mcp/protocol";

const CAMERA_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const INSTALL_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TENANT = "tenant-1";
const USER = "user-1";

const permsFull = {
  modules: { ops: "full" },
  submodules: {},
  capabilities: { camaras_configure: true },
} as unknown as RolePermissions;

const permsView = {
  modules: { ops: "view" },
  submodules: { "ops.camaras": "view" },
  capabilities: {},
} as unknown as RolePermissions;

const permsNone = {
  modules: {},
  submodules: {},
  capabilities: {},
} as unknown as RolePermissions;

const publicCamera = {
  id: CAMERA_ID,
  tenantId: TENANT,
  installationId: INSTALL_ID,
  name: "Entrada",
  sourceType: "nvr",
  brand: "hikvision",
  host: "10.0.0.8",
  rtspPort: 554,
  onvifPort: 80,
  channel: 1,
  streamQuality: "sub",
  customPath: null,
  username: "viewer",
  ptzCapable: false,
  streamName: "cabc",
  status: "untested",
  lastSeenAt: null,
  lastError: null,
  isActive: true,
  sortOrder: 0,
  notes: null,
  createdBy: USER,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("tool wiring cámaras MCP", () => {
  it("expone 4 lecturas y 8 escrituras en getToolDefinitionsV2", () => {
    const read = new Set(getToolDefinitionsV2(true, false).map((d) => d.function.name));
    const write = new Set(getToolDefinitionsV2(true, true).map((d) => d.function.name));
    const readNames = camarasReadToolDefinitions().map((d) => d.function.name);
    const writeNames = camarasWriteToolDefinitions().map((d) => d.function.name);
    expect(readNames).toHaveLength(4);
    expect(writeNames).toHaveLength(8);
    for (const name of readNames) {
      expect(read.has(name)).toBe(true);
      expect(write.has(name)).toBe(true);
    }
    for (const name of writeNames) {
      expect(read.has(name)).toBe(false);
      expect(write.has(name)).toBe(true);
    }
    expect(getToolDefinitionsV2(true, false)).toHaveLength(64);
    expect(getToolDefinitionsV2(true, true)).toHaveLength(155);
  });

  it("marca writes y delete_camera como destructiva", () => {
    expect(WRITE_TOOL_NAMES.has("create_camera")).toBe(true);
    expect(WRITE_TOOL_NAMES.has("update_camera")).toBe(true);
    expect(WRITE_TOOL_NAMES.has("delete_camera")).toBe(true);
    expect(WRITE_TOOL_NAMES.has("test_camera_connection")).toBe(true);
    expect(WRITE_TOOL_NAMES.has("ptz_camera")).toBe(true);
    expect(WRITE_TOOL_NAMES.has("list_cameras")).toBe(false);
    expect(WRITE_TOOL_NAMES.has("get_camera")).toBe(false);
    expect(MCP_DESTRUCTIVE_TOOL_NAMES.has("delete_camera")).toBe(true);
    expect(MCP_DESTRUCTIVE_TOOL_NAMES.has("delete_camera_layout")).toBe(true);
  });
});

describe("list/get/create/update/delete cámaras", () => {
  beforeEach(() => {
    isTenantModuleEnabledMock.mockReset().mockResolvedValue(true);
    listCamarasMock.mockReset();
    getCamaraMock.mockReset();
    createCamaraMock.mockReset();
    updateCamaraMock.mockReset();
    deactivateCamaraMock.mockReset();
    assertInstallationMock.mockReset();
    testCamaraConnectionMock.mockReset();
    runCamaraPtzMock.mockReset();
    vi.mocked(prisma.admin.findFirst).mockReset().mockResolvedValue({
      email: "ops@gard.cl",
      role: "owner",
    } as never);
    vi.mocked(prisma.aiActionLog.create).mockReset().mockResolvedValue({} as never);
  });

  it("niega list_cameras si el add-on está apagado", async () => {
    isTenantModuleEnabledMock.mockResolvedValue(false);
    const res = await toolListCameras(TENANT, USER, permsFull, {});
    expect(res).toMatchObject({ ok: false, error: expect.stringContaining("ops_camaras") });
    expect(listCamarasMock).not.toHaveBeenCalled();
  });

  it("niega list_cameras sin permiso ops.camaras", async () => {
    const res = await toolListCameras(TENANT, USER, permsNone, {});
    expect(res).toMatchObject({ ok: false });
    expect(listCamarasMock).not.toHaveBeenCalled();
  });

  it("lista cámaras sin passwordEnc y con status de stream", async () => {
    listCamarasMock.mockResolvedValue([{ ...publicCamera, passwordEnc: "secret" }]);
    const res = await toolListCameras(TENANT, USER, permsView, {
      installationId: INSTALL_ID,
    });
    expect(res).toMatchObject({ ok: true, count: 1 });
    const data = (res as { data: Record<string, unknown>[] }).data[0];
    expect(data.name).toBe("Entrada");
    expect(data.status).toBe("untested");
    expect(data).not.toHaveProperty("passwordEnc");
    expect(listCamarasMock).toHaveBeenCalledWith(TENANT, expect.objectContaining({
      installationId: INSTALL_ID,
    }));
  });

  it("get_camera 404 si no existe", async () => {
    getCamaraMock.mockResolvedValue(null);
    const res = await toolGetCamera(TENANT, USER, permsView, { cameraId: CAMERA_ID });
    expect(res).toMatchObject({ ok: false, error: expect.stringContaining("no encontrada") });
  });

  it("create_camera exige camaras_configure y llama mutate", async () => {
    const denied = await toolCreateCamera(TENANT, USER, permsView, {
      installationId: INSTALL_ID,
      name: "Entrada",
      host: "10.0.0.8",
      username: "viewer",
      password: "secret-pass",
    });
    expect(denied).toMatchObject({ ok: false, error: expect.stringContaining("camaras_configure") });

    assertInstallationMock.mockResolvedValue({ id: INSTALL_ID });
    createCamaraMock.mockResolvedValue({ camera: publicCamera, warning: null, adminUsernameWarning: null });
    const ok = await toolCreateCamera(TENANT, USER, permsFull, {
      installationId: INSTALL_ID,
      name: "Entrada",
      host: "10.0.0.8",
      username: "viewer",
      password: "secret-pass",
      brand: "hikvision",
    });
    expect(ok).toMatchObject({ ok: true, camera: expect.objectContaining({ id: CAMERA_ID }) });
    expect(createCamaraMock).toHaveBeenCalled();
    const logArgs = vi.mocked(prisma.aiActionLog.create).mock.calls.at(-1)?.[0] as {
      data: { args: Record<string, unknown> };
    };
    expect(logArgs.data.args.password).toBe("[redacted]");
  });

  it("update_camera con isActive=false deshabilita", async () => {
    updateCamaraMock.mockResolvedValue({
      camera: { ...publicCamera, isActive: false },
      warning: null,
      adminUsernameWarning: null,
    });
    const res = await toolUpdateCamera(TENANT, USER, permsFull, {
      cameraId: CAMERA_ID,
      isActive: false,
    });
    expect(res).toMatchObject({ ok: true, camera: expect.objectContaining({ isActive: false }) });
    expect(updateCamaraMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT, userId: USER }),
      CAMERA_ID,
      { isActive: false },
    );
  });

  it("delete_camera da de baja lógica", async () => {
    deactivateCamaraMock.mockResolvedValue({ ...publicCamera, isActive: false, status: "offline" });
    const res = await toolDeleteCamera(TENANT, USER, permsFull, { cameraId: CAMERA_ID });
    expect(res).toMatchObject({ ok: true, data: expect.objectContaining({ isActive: false }) });
    expect(deactivateCamaraMock).toHaveBeenCalled();
  });

  it("test_camera_connection no devuelve el JPEG", async () => {
    testCamaraConnectionMock.mockResolvedValue({
      camera: { ...publicCamera, status: "online" },
      dataUrl: "data:image/jpeg;base64,AAAA",
    });
    const res = await toolTestCameraConnection(TENANT, USER, permsView, { cameraId: CAMERA_ID });
    expect(res).toMatchObject({ ok: true, snapshotAvailable: true });
    expect(res).not.toHaveProperty("dataUrl");
  });

  it("ptz_camera niega con mensaje string si el relay/ONVIF falla", async () => {
    runCamaraPtzMock.mockResolvedValue({ error: "PTZ no disponible" });
    const res = await toolPtzCamera(TENANT, USER, permsView, {
      cameraId: CAMERA_ID,
      action: "stop",
    });
    expect(res).toEqual({ ok: false, error: "PTZ no disponible" });
  });

  it("list_camera_brands incluye hikvision y puertos default", async () => {
    const res = await toolListCameraBrands(TENANT, USER, permsView);
    expect(res).toMatchObject({ ok: true });
    const hik = (res as { data: { brand: string; rtspPort: number }[] }).data.find((b) => b.brand === "hikvision");
    expect(hik?.rtspPort).toBe(554);
  });

  it("executeToolCallV2 despacha list_cameras", async () => {
    listCamarasMock.mockResolvedValue([publicCamera]);
    const res = await executeToolCallV2("list_cameras", {}, TENANT, USER, permsView, false, null);
    expect(res).toMatchObject({ ok: true, count: 1 });
  });
});
