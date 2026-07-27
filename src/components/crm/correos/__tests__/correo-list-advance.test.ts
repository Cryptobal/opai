import { describe, expect, it } from "vitest";
import { nextThreadAfterRemove } from "../correo-list-advance";

const list = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("nextThreadAfterRemove", () => {
  it("avanza al de abajo cuando hay siguiente", () => {
    expect(nextThreadAfterRemove(list, "a")).toEqual({
      nextId: "b",
      nextFocusIndex: 0,
    });
    expect(nextThreadAfterRemove(list, "b")).toEqual({
      nextId: "c",
      nextFocusIndex: 1,
    });
  });

  it("retrocede al de arriba si era el último", () => {
    expect(nextThreadAfterRemove(list, "c")).toEqual({
      nextId: "b",
      nextFocusIndex: 1,
    });
  });

  it("sin vecinos deja el lector vacío", () => {
    expect(nextThreadAfterRemove([{ id: "solo" }], "solo")).toEqual({
      nextId: null,
      nextFocusIndex: -1,
    });
  });

  it("id ausente no mueve el foco", () => {
    expect(nextThreadAfterRemove(list, "x")).toEqual({
      nextId: null,
      nextFocusIndex: -1,
    });
  });
});
