import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRondaTracking } from "../useRondaTracking";
import type { RondaLatLng } from "../useRondaTracking";

describe("useRondaTracking", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("con posición desde el inicio: 90s → exactamente 4 tracking (1 mount + 3 ticks)", async () => {
    const sendTracking = vi.fn().mockResolvedValue(undefined);
    const sendFlush = vi.fn().mockResolvedValue(undefined);
    const pos: RondaLatLng = { lat: -33.4, lng: -70.6 };

    renderHook(() =>
      useRondaTracking({
        ejecucionId: "ej-1",
        guardiaId: "g-1",
        getPosition: () => pos,
        getTrail: () => [],
        sendTracking,
        sendFlush,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(sendTracking).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000);
    });
    expect(sendTracking).toHaveBeenCalledTimes(4);
    expect(sendFlush).toHaveBeenCalledTimes(0);
  });

  it("con posición cambiando cada 1s durante 90s: siguen siendo exactamente 4 tracking", async () => {
    const sendTracking = vi.fn().mockResolvedValue(undefined);
    const sendFlush = vi.fn().mockResolvedValue(undefined);
    let lat = -33.4;
    const getPosition = () => ({ lat, lng: -70.6 });

    renderHook(() =>
      useRondaTracking({
        ejecucionId: "ej-1",
        guardiaId: "g-1",
        getPosition,
        getTrail: () => [],
        sendTracking,
        sendFlush,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      for (let i = 0; i < 90; i++) {
        lat += 0.00001;
        await vi.advanceTimersByTimeAsync(1_000);
      }
    });

    expect(sendTracking).toHaveBeenCalledTimes(4);
  });

  it("sin posición: cero envíos y sin excepción", async () => {
    const sendTracking = vi.fn().mockResolvedValue(undefined);
    const sendFlush = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      useRondaTracking({
        ejecucionId: "ej-1",
        guardiaId: "g-1",
        getPosition: () => null,
        getTrail: () => [],
        sendTracking,
        sendFlush,
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(90_000);
    });

    expect(sendTracking).toHaveBeenCalledTimes(0);
    expect(sendFlush).toHaveBeenCalledTimes(0);
  });

  it("con ≥2 puntos de traza: 130s → exactamente 2 flushes con traza completa", async () => {
    const sendTracking = vi.fn().mockResolvedValue(undefined);
    const sendFlush = vi.fn().mockResolvedValue(undefined);
    const trail: RondaLatLng[] = [
      { lat: -33.4, lng: -70.6 },
      { lat: -33.401, lng: -70.601 },
    ];

    renderHook(() =>
      useRondaTracking({
        ejecucionId: "ej-1",
        guardiaId: "g-1",
        getPosition: () => trail[trail.length - 1]!,
        getTrail: () => trail,
        sendTracking,
        sendFlush,
      }),
    );

    await act(async () => {
      await Promise.resolve();
      // Grow trail while timers run — flush must still send FULL array
      trail.push({ lat: -33.402, lng: -70.602 });
      trail.push({ lat: -33.403, lng: -70.603 });
      await vi.advanceTimersByTimeAsync(130_000);
    });

    expect(sendFlush).toHaveBeenCalledTimes(2);
    const lastPayload = sendFlush.mock.calls[1]?.[0] as {
      points: RondaLatLng[];
    };
    expect(lastPayload.points).toHaveLength(4);
    expect(lastPayload.points).toEqual(trail);
  });

  it("al desmontar: vi.getTimerCount() en 0", () => {
    const { unmount } = renderHook(() =>
      useRondaTracking({
        ejecucionId: "ej-1",
        guardiaId: "g-1",
        getPosition: () => ({ lat: 1, lng: 2 }),
        getTrail: () => [
          { lat: 1, lng: 2 },
          { lat: 1.1, lng: 2.1 },
        ],
        sendTracking: vi.fn().mockResolvedValue(undefined),
        sendFlush: vi.fn().mockResolvedValue(undefined),
      }),
    );
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
