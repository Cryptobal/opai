/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resolveThreadOpenScrollId,
  scrollCorreoMessageIntoView,
} from "../correo-thread-scroll";

describe("resolveThreadOpenScrollId", () => {
  it("hilo vacío → null", () => {
    expect(resolveThreadOpenScrollId([])).toBeNull();
  });

  it("1 mensaje → ese id", () => {
    expect(resolveThreadOpenScrollId(["a"])).toBe("a");
  });

  it("≥2 sin deep-link → penúltimo (peek sobre el último)", () => {
    expect(resolveThreadOpenScrollId(["a", "b"])).toBe("a");
    expect(resolveThreadOpenScrollId(["a", "b", "c", "d"])).toBe("c");
  });

  it("deep-link al último → sigue anclando en penúltimo", () => {
    expect(resolveThreadOpenScrollId(["a", "b", "c"], "c")).toBe("b");
  });

  it("deep-link a un mensaje intermedio → ese id", () => {
    expect(resolveThreadOpenScrollId(["a", "b", "c", "d"], "b")).toBe("b");
  });

  it("deep-link desconocido → penúltimo", () => {
    expect(resolveThreadOpenScrollId(["a", "b", "c"], "nope")).toBe("b");
  });
});

describe("scrollCorreoMessageIntoView", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("scrollea dentro del reader scroller", () => {
    const scroller = document.createElement("div");
    scroller.setAttribute("data-correo-reader-scroller", "");
    Object.defineProperty(scroller, "scrollTop", { value: 400, writable: true });
    scroller.scrollTo = vi.fn();

    const msg = document.createElement("div");
    msg.setAttribute("data-correo-message-id", "m-last");
    scroller.appendChild(msg);
    document.body.appendChild(scroller);

    vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue({
      top: 100,
      bottom: 700,
      left: 0,
      right: 400,
      width: 400,
      height: 600,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    });
    vi.spyOn(msg, "getBoundingClientRect").mockReturnValue({
      top: 520,
      bottom: 560,
      left: 0,
      right: 400,
      width: 400,
      height: 40,
      x: 0,
      y: 520,
      toJSON: () => ({}),
    });

    expect(scrollCorreoMessageIntoView("m-last", "auto")).toBe(true);
    expect(scroller.scrollTo).toHaveBeenCalledWith({
      top: 400 + (520 - 100) - 8,
      behavior: "auto",
    });
  });

  it("sin nodo → false", () => {
    expect(scrollCorreoMessageIntoView("missing")).toBe(false);
  });
});
