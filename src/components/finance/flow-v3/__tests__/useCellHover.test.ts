import { describe, expect, it } from "vitest";
import { shouldOpenPinnedDetailOnContextMenu } from "../useCellHover";

describe("shouldOpenPinnedDetailOnContextMenu", () => {
  it("abre con clic derecho sobre la celda ya activa en desktop", () => {
    expect(shouldOpenPinnedDetailOnContextMenu({ selected: true, desktop: true })).toBe(true);
  });

  it("no abre si la celda no está seleccionada", () => {
    expect(shouldOpenPinnedDetailOnContextMenu({ selected: false, desktop: true })).toBe(false);
  });

  it("no abre en touch / viewport estrecho", () => {
    expect(shouldOpenPinnedDetailOnContextMenu({ selected: true, desktop: false })).toBe(false);
  });
});
