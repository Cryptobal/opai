/**
 * Un 409 de colisión NO puede morir en un toast rojo: el drag debe exponer el
 * conflicto para que la grilla abra el modal [Reemplazar] / [Mover a fecha
 * libre]. Los demás errores (semana cerrada, red) sí siguen siendo toast.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const toastError = vi.fn();
const toastSuccess = vi.fn();
const toastInfo = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...a: unknown[]) => toastError(...a),
    success: (...a: unknown[]) => toastSuccess(...a),
    info: (...a: unknown[]) => toastInfo(...a),
  },
}));

const moveViaApi = vi.fn();
vi.mock("../cashflow-move", () => ({
  moveViaApi: (...a: unknown[]) => moveViaApi(...a),
}));

vi.mock("../return-range-client", () => ({
  rangeFromBucketKeys: () => undefined,
}));

import { useGridMove, type GridDragData } from "../useGridMove";

const buckets = [
  { key: "2026-W28", label: "Sem 28", start: "2026-07-06", end: "2026-07-12" },
  { key: "2026-W29", label: "Sem 29", start: "2026-07-13", end: "2026-07-19" },
] as unknown as Parameters<typeof useGridMove>[0]["buckets"];

const drag: GridDragData = {
  kind: "grid-chip",
  itemId: "22222222-2222-4222-8222-222222222222",
  itemName: "Arriendo",
  occurrenceId: "33333333-3333-4333-8333-333333333333",
  dteId: null,
  originalDate: "2026-07-06",
  fromBucketKey: "2026-W28",
  amount: 100,
  variant: "projected" as GridDragData["variant"],
  locked: false,
};

const CONFLICT = {
  existingOccurrenceId: "occ-x",
  targetDate: "2026-07-13",
  suggestedFreeDate: "2026-07-14",
  reason: "same_level" as const,
};

function setup(onConflict?: ReturnType<typeof vi.fn>) {
  return renderHook(() =>
    useGridMove({
      buckets,
      refreshWeeks: vi.fn().mockResolvedValue(undefined),
      pushUndo: vi.fn(),
      ...(onConflict ? { onConflict } : {}),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useGridMove — colisión", () => {
  it("409 con conflict: no toastea error y expone el conflicto", async () => {
    const onConflict = vi.fn();
    moveViaApi.mockResolvedValue({ ok: false, conflict: CONFLICT, status: 409 });
    const { result } = setup(onConflict);

    await act(async () => {
      await result.current.move(drag, "2026-W29");
    });

    expect(toastError).not.toHaveBeenCalled();
    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(onConflict.mock.calls[0][0]).toEqual(CONFLICT);
  });

  it("retry('replace') reintenta el move con la estrategia", async () => {
    const onConflict = vi.fn();
    moveViaApi
      .mockResolvedValueOnce({ ok: false, conflict: CONFLICT, status: 409 })
      .mockResolvedValueOnce({ ok: true });
    const { result } = setup(onConflict);

    await act(async () => {
      await result.current.move(drag, "2026-W29");
    });
    const retry = onConflict.mock.calls[0][1] as (s: string) => Promise<void>;
    await act(async () => {
      await retry("replace");
    });

    expect(moveViaApi).toHaveBeenCalledTimes(2);
    expect(moveViaApi.mock.calls[1][0]).toMatchObject({
      resolveStrategy: "replace",
      newDate: "2026-07-13",
    });
    expect(toastSuccess).toHaveBeenCalledWith("Movido a Sem 29");
  });

  it("retry('next_free'): el label usa la fecha libre real, no el bucket", async () => {
    const onConflict = vi.fn();
    moveViaApi
      .mockResolvedValueOnce({ ok: false, conflict: CONFLICT, status: 409 })
      .mockResolvedValueOnce({ ok: true });
    const pushUndo = vi.fn();
    const { result } = renderHook(() =>
      useGridMove({
        buckets,
        refreshWeeks: vi.fn().mockResolvedValue(undefined),
        pushUndo,
        onConflict,
      }),
    );

    await act(async () => {
      await result.current.move(drag, "2026-W29");
    });
    const retry = onConflict.mock.calls[0][1] as (s: string) => Promise<void>;
    await act(async () => {
      await retry("next_free");
    });

    expect(moveViaApi.mock.calls[1][0]).toMatchObject({
      resolveStrategy: "next_free",
    });
    // 2026-07-14 → "14 jul", no "Sem 29".
    expect(toastSuccess).toHaveBeenCalledWith("Movido a 14 jul");
    expect(pushUndo.mock.calls[0][0].destLabel).toBe("14 jul");
  });

  it("error sin conflict (semana cerrada): toast rojo, sin modal", async () => {
    const onConflict = vi.fn();
    moveViaApi.mockResolvedValue({
      ok: false,
      error: "La semana destino está cerrada.",
    });
    const { result } = setup(onConflict);

    await act(async () => {
      await result.current.move(drag, "2026-W29");
    });

    expect(onConflict).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalled();
  });
});
