/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import {
  LAST_PRODUCTIVIDAD_PATH_KEY,
  readLastProductividadPath,
  useAutoSwitchSurfaceToErp,
  useTrackProductividadPath,
} from "@/lib/surface-tracking";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ refresh: mockRefresh }),
}));

let mockPathname = "/crm/correos";
const mockRefresh = vi.fn();

describe("useTrackProductividadPath", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockPathname = "/crm/correos";
  });

  it("escribe opai-last-productividad-path en superficie productividad", () => {
    renderHook(() => useTrackProductividadPath("productividad"));
    expect(sessionStorage.getItem(LAST_PRODUCTIVIDAD_PATH_KEY)).toBe("/crm/correos");
    expect(readLastProductividadPath()).toBe("/crm/correos");
  });

  it("no escribe en superficie erp", () => {
    renderHook(() => useTrackProductividadPath("erp"));
    expect(sessionStorage.getItem(LAST_PRODUCTIVIDAD_PATH_KEY)).toBeNull();
  });

  it("no escribe rutas ERP aunque la superficie sea productividad", () => {
    mockPathname = "/hub";
    renderHook(() => useTrackProductividadPath("productividad"));
    expect(sessionStorage.getItem(LAST_PRODUCTIVIDAD_PATH_KEY)).toBeNull();
  });
});

describe("useAutoSwitchSurfaceToErp", () => {
  beforeEach(() => {
    mockPathname = "/crm/cotizaciones/abc";
    mockRefresh.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true } as Response),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POST /api/me/surface erp + refresh en ruta ERP con cookie productividad", async () => {
    renderHook(() => useAutoSwitchSurfaceToErp("productividad"));
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/me/surface",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ surface: "erp" }),
        }),
      );
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  it("no hace nada en superficie erp", async () => {
    renderHook(() => useAutoSwitchSurfaceToErp("erp"));
    await new Promise((r) => setTimeout(r, 20));
    expect(fetch).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("no hace nada si el pathname sigue siendo del portal Productividad", async () => {
    mockPathname = "/crm/correos";
    renderHook(() => useAutoSwitchSurfaceToErp("productividad"));
    await new Promise((r) => setTimeout(r, 20));
    expect(fetch).not.toHaveBeenCalled();
  });
});
