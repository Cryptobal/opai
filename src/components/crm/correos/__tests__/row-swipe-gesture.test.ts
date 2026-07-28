import { describe, expect, it } from "vitest";
import {
  isSwipeArmed,
  isSwipeFlick,
  isSwipeOpenReached,
  resolveSwipeRelease,
  SWIPE_BUTTON_WIDTH,
  SWIPE_COMMIT_RATIO,
  SWIPE_FLICK_VELOCITY,
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

  it("marca armado al 45% del ancho de fila", () => {
    expect(isSwipeArmed(ROW * SWIPE_COMMIT_RATIO - 1, ROW)).toBe(false);
    expect(isSwipeArmed(ROW * SWIPE_COMMIT_RATIO, ROW)).toBe(true);
  });

  it("marca apertura completa al ancho de dos botones", () => {
    expect(isSwipeOpenReached(SWIPE_OPEN_WIDTH - 1)).toBe(false);
    expect(isSwipeOpenReached(SWIPE_OPEN_WIDTH)).toBe(true);
  });

  it("detecta flick solo con velocidad y desplazamiento ≥ OPEN", () => {
    expect(
      isSwipeFlick("left", SWIPE_OPEN_WIDTH, -SWIPE_FLICK_VELOCITY),
    ).toBe(true);
    expect(
      isSwipeFlick("left", SWIPE_OPEN_WIDTH - 1, -SWIPE_FLICK_VELOCITY),
    ).toBe(false);
    expect(
      isSwipeFlick("right", SWIPE_OPEN_WIDTH, SWIPE_FLICK_VELOCITY),
    ).toBe(true);
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
    expect(100).toBeLessThan(ROW * SWIPE_COMMIT_RATIO);
  });

  it("hace commit al 45% del ancho de fila", () => {
    expect(
      resolveSwipeRelease({
        value: ROW * SWIPE_COMMIT_RATIO,
        rowWidth: ROW,
        velocityX: 0,
      }),
    ).toEqual({ type: "commit", side: "right" });
  });

  it("hace commit con flick válido (≥ OPEN + velocidad alta)", () => {
    // 100 px < OPEN: aunque la velocidad sea alta, no es flick (protege WebKit).
    expect(
      resolveSwipeRelease({
        value: -100,
        rowWidth: ROW,
        velocityX: -1400,
      }),
    ).toEqual({ type: "snap", side: "left" });

    expect(
      resolveSwipeRelease({
        value: -SWIPE_OPEN_WIDTH,
        rowWidth: ROW,
        velocityX: -1400,
      }),
    ).toEqual({ type: "commit", side: "left" });
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

  it("ignora velocidad espuria por debajo de OPEN (causa raíz WebKit)", () => {
    expect(
      resolveSwipeRelease({
        value: -60,
        rowWidth: ROW,
        velocityX: -3000,
      }),
    ).toEqual({ type: "close" });
  });

  it("nunca ejecuta acción (commit) por debajo de SWIPE_OPEN_WIDTH", () => {
    for (const value of [
      0,
      36,
      60,
      72,
      SWIPE_OPEN_WIDTH - 1,
      -(SWIPE_OPEN_WIDTH - 1),
      -100,
    ]) {
      const abs = Math.abs(value);
      if (abs >= SWIPE_OPEN_WIDTH) continue;
      const outcome = resolveSwipeRelease({
        value,
        rowWidth: ROW,
        velocityX: value < 0 ? -5000 : 5000,
      });
      expect(outcome.type).not.toBe("commit");
    }
  });

  it("expone ancho de apertura estándar de dos botones", () => {
    expect(SWIPE_OPEN_WIDTH).toBe(156);
    expect(SWIPE_BUTTON_WIDTH).toBe(78);
  });
});
