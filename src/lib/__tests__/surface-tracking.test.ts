/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  LAST_PRODUCTIVIDAD_PATH_KEY,
  readLastProductividadPath,
  useTrackProductividadPath,
} from "@/lib/surface-tracking";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

let mockPathname = "/crm/correos";

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
