import { describe, expect, it } from "vitest";
import {
  isSwipeOpenReached,
  resolveSwipeRelease,
  SWIPE_BUTTON_WIDTH,
  SWIPE_OPEN_WIDTH,
  SWIPE_RUBBER_BAND,
  SWIPE_SNAP_RATIO,
  toVisualDx,
} from "../row-swipe-gesture";

const ROW = 390;

describe("row-swipe-gesture", () => {
  it("aplica rubber-band pasado el ancho de botones", () => {
    expect(toVisualDx(SWIPE_OPEN_WIDTH)).toBe(SWIPE_OPEN_WIDTH);
    expect(toVisualDx(200)).toBeCloseTo(
      SWIPE_OPEN_WIDTH + (200 - SWIPE_OPEN_WIDTH) * SWIPE_RUBBER_BAND,
    );
    expect(toVisualDx(-200)).toBeCloseTo(
      -(SWIPE_OPEN_WIDTH + (200 - SWIPE_OPEN_WIDTH) * SWIPE_RUBBER_BAND),
    );
  });

  it("marca apertura completa al ancho de dos botones", () => {
    expect(isSwipeOpenReached(SWIPE_OPEN_WIDTH - 1)).toBe(false);
    expect(isSwipeOpenReached(SWIPE_OPEN_WIDTH)).toBe(true);
  });

  it("cierra gestos cortos (60 px)", () => {
    expect(
      resolveSwipeRelease({ value: 60, rowWidth: ROW, velocityX: 0 }),
    ).toEqual({ type: "close" });
    expect(
      resolveSwipeRelease({ value: -60, rowWidth: ROW, velocityX: 0 }),
    ).toEqual({ type: "close" });
  });

  it("hace snap a 100 px en fila de 390", () => {
    expect(
      resolveSwipeRelease({ value: 100, rowWidth: ROW, velocityX: 0 }),
    ).toEqual({ type: "snap", side: "right" });
    expect(100).toBeGreaterThanOrEqual(SWIPE_OPEN_WIDTH * SWIPE_SNAP_RATIO);
  });

  it("hace snap al soltar profundo o con flick (nunca commit)", () => {
    expect(
      resolveSwipeRelease({
        value: ROW * 0.45,
        rowWidth: ROW,
        velocityX: 0,
      }),
    ).toEqual({ type: "snap", side: "right" });

    expect(
      resolveSwipeRelease({
        value: -SWIPE_OPEN_WIDTH,
        rowWidth: ROW,
        velocityX: -1400,
      }),
    ).toEqual({ type: "snap", side: "left" });
  });

  it("hace snap con velocidad insuficiente en zona OPEN", () => {
    expect(
      resolveSwipeRelease({
        value: -100,
        rowWidth: ROW,
        velocityX: -900,
      }),
    ).toEqual({ type: "snap", side: "left" });
  });

  it("ignora velocidad espuria por debajo del umbral de snap", () => {
    expect(
      resolveSwipeRelease({
        value: -60,
        rowWidth: ROW,
        velocityX: -3000,
      }),
    ).toEqual({ type: "close" });
  });

  it("nunca ejecuta acción al soltar (solo snap o close)", () => {
    for (const value of [
      0,
      36,
      60,
      72,
      SWIPE_OPEN_WIDTH - 1,
      SWIPE_OPEN_WIDTH,
      ROW * 0.5,
      -(SWIPE_OPEN_WIDTH - 1),
      -SWIPE_OPEN_WIDTH,
      -100,
      -ROW,
    ]) {
      const outcome = resolveSwipeRelease({
        value,
        rowWidth: ROW,
        velocityX: value < 0 ? -5000 : 5000,
      });
      expect(outcome.type === "snap" || outcome.type === "close").toBe(true);
    }
  });

  it("expone ancho de apertura estándar de dos botones", () => {
    expect(SWIPE_OPEN_WIDTH).toBe(156);
    expect(SWIPE_BUTTON_WIDTH).toBe(78);
  });
});
