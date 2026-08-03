/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scrollComposerIntoView } from "../correo-composer-scroll";

describe("scrollComposerIntoView", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("alinea el tope del composer dentro del scroller del lector (no el fondo)", () => {
    const scroller = document.createElement("div");
    scroller.setAttribute("data-correo-reader-scroller", "");
    Object.defineProperty(scroller, "scrollTop", { value: 400, writable: true });
    scroller.scrollTo = vi.fn();
    scroller.getBoundingClientRect = () =>
      ({ top: 100, bottom: 700, height: 600, left: 0, right: 400, width: 400, x: 0, y: 100, toJSON: () => ({}) });

    const surface = document.createElement("div");
    surface.setAttribute("data-correo-composer-surface", "");
    surface.dataset.composerPresentation = "inline";
    surface.scrollTop = 0;
    surface.scrollTo = vi.fn();
    surface.getBoundingClientRect = () =>
      ({ top: 500, bottom: 1100, height: 600, left: 0, right: 400, width: 400, x: 0, y: 500, toJSON: () => ({}) });

    scroller.appendChild(surface);
    document.body.appendChild(scroller);

    scrollComposerIntoView();
    vi.runAllTimers();

    // nextTop = 400 + (500 - 100) - 8 = 792 → alinea el tope, no el bottom.
    expect(scroller.scrollTo).toHaveBeenCalledWith({
      top: 792,
      behavior: "smooth",
    });
  });

  it("en fullscreen (fuera del scroller) solo resetea scroll de la superficie", () => {
    const scroller = document.createElement("div");
    scroller.setAttribute("data-correo-reader-scroller", "");
    scroller.scrollTo = vi.fn();

    const surface = document.createElement("div");
    surface.setAttribute("data-correo-composer-surface", "");
    surface.dataset.composerPresentation = "fullscreen";
    surface.scrollTop = 120;
    surface.scrollTo = vi.fn();

    document.body.appendChild(scroller);
    document.body.appendChild(surface);

    scrollComposerIntoView();
    vi.runAllTimers();

    expect(surface.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
    expect(scroller.scrollTo).not.toHaveBeenCalled();
  });
});
