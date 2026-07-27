import { describe, expect, it } from "vitest";
import {
  isSwipeArmed,
  isSwipeFlick,
  resolveSwipeRelease,
  SWIPE_BUTTON_WIDTH,
  SWIPE_FLICK_MIN_OFFSET,
  SWIPE_FLICK_VELOCITY,
  SWIPE_LONG_RATIO,
  SWIPE_MIN_COMMIT,
  SWIPE_OPEN_WIDTH,
  toVisualDx,
} from "../row-swipe-gesture";

const ROW = 390;

describe("row-swipe-gesture", () => {
  it("aplica rubber-band pasado el ancho de botones", () => {
    expect(toVisualDx(148)).toBe(148);
    expect(toVisualDx(200)).toBeCloseTo(148 + (200 - 148) * 0.35);
    expect(toVisualDx(-200)).toBeCloseTo(-(148 + (200 - 148) * 0.35));
  });

  it("marca armado al 42% del ancho de fila", () => {
    expect(isSwipeArmed(ROW * SWIPE_LONG_RATIO - 1, ROW)).toBe(false);
    expect(isSwipeArmed(ROW * SWIPE_LONG_RATIO, ROW)).toBe(true);
  });

  it("detecta flick rápido hacia la izquierda", () => {
    expect(
      isSwipeFlick("left", SWIPE_FLICK_MIN_OFFSET, -SWIPE_FLICK_VELOCITY),
    ).toBe(true);
    expect(
      isSwipeFlick("left", SWIPE_FLICK_MIN_OFFSET - 1, -SWIPE_FLICK_VELOCITY),
    ).toBe(false);
    expect(
      isSwipeFlick("right", SWIPE_FLICK_MIN_OFFSET, SWIPE_FLICK_VELOCITY),
    ).toBe(true);
  });

  it("cierra gestos por debajo del mínimo", () => {
    expect(
      resolveSwipeRelease({ value: SWIPE_MIN_COMMIT - 1, rowWidth: ROW, velocityX: 0 }),
    ).toEqual({ type: "close" });
  });

  it("dispara acción larga por posición o flick", () => {
    expect(
      resolveSwipeRelease({
        value: ROW * SWIPE_LONG_RATIO,
        rowWidth: ROW,
        velocityX: 0,
      }),
    ).toEqual({ type: "long", side: "right" });

    expect(
      resolveSwipeRelease({
        value: -SWIPE_FLICK_MIN_OFFSET,
        rowWidth: ROW,
        velocityX: -SWIPE_FLICK_VELOCITY,
      }),
    ).toEqual({ type: "long", side: "left" });
  });

  it("hace snap corto en zona intermedia baja", () => {
    expect(
      resolveSwipeRelease({ value: 48, rowWidth: ROW, velocityX: 0 }),
    ).toEqual({ type: "snap", side: "right" });
  });

  it("ejecuta botón dominante sin tap en zona media", () => {
    expect(
      resolveSwipeRelease({
        value: SWIPE_BUTTON_WIDTH * 0.9,
        rowWidth: ROW,
        velocityX: 0,
      }),
    ).toEqual({ type: "button", side: "right", buttonIndex: 0 });

    expect(
      resolveSwipeRelease({
        value: -(SWIPE_BUTTON_WIDTH * 0.9),
        rowWidth: ROW,
        velocityX: 0,
      }),
    ).toEqual({ type: "button", side: "left", buttonIndex: 1 });

    expect(
      resolveSwipeRelease({
        value: SWIPE_BUTTON_WIDTH * 1.3,
        rowWidth: ROW,
        velocityX: 0,
      }),
    ).toEqual({ type: "button", side: "right", buttonIndex: 0 });

    expect(
      resolveSwipeRelease({
        value: -(SWIPE_BUTTON_WIDTH * 1.3),
        rowWidth: ROW,
        velocityX: 0,
      }),
    ).toEqual({ type: "button", side: "left", buttonIndex: 1 });
  });

  it("expone ancho de apertura estándar de dos botones", () => {
    expect(SWIPE_OPEN_WIDTH).toBe(148);
    expect(SWIPE_BUTTON_WIDTH).toBe(74);
  });
});
