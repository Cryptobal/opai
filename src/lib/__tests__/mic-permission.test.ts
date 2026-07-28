import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  acquireUserMediaAudio,
  queryMicPermission,
  rememberMicGranted,
  shouldForceServerDictation,
  wasMicGrantedBefore,
} from "../mic-permission";

describe("mic-permission", () => {
  const originalPermissions = navigator.permissions;
  const originalMediaDevices = navigator.mediaDevices;
  const originalUA = navigator.userAgent;

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: originalPermissions,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: originalMediaDevices,
    });
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: originalUA,
    });
    vi.restoreAllMocks();
  });

  it("rememberMicGranted persiste en session y local", () => {
    rememberMicGranted();
    expect(wasMicGrantedBefore()).toBe(true);
  });

  it("queryMicPermission lee Permissions API", async () => {
    Object.defineProperty(navigator, "permissions", {
      configurable: true,
      value: {
        query: vi.fn().mockResolvedValue({ state: "granted" }),
      },
    });
    await expect(queryMicPermission()).resolves.toBe("granted");
    expect(wasMicGrantedBefore()).toBe(true);
  });

  it("acquireUserMediaAudio marca granted tras éxito", async () => {
    const track = { stop: vi.fn(), addEventListener: vi.fn() };
    const stream = { getTracks: () => [track] };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(stream),
      },
    });
    const got = await acquireUserMediaAudio();
    expect(got).toBe(stream);
    expect(wasMicGrantedBefore()).toBe(true);
  });

  it("shouldForceServerDictation en UA iPhone", () => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
    });
    expect(shouldForceServerDictation()).toBe(true);
  });
});
