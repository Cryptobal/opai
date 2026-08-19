import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadOrShareFile } from "../download-or-share";

describe("downloadOrShareFile", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => new Blob(["%PDF"], { type: "application/pdf" }),
        json: async () => ({}),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("usa Web Share API en pointer coarse cuando puede compartir archivos", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      canShare: vi.fn().mockReturnValue(true),
      share,
    });
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("pointer: coarse"),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );

    const result = await downloadOrShareFile({
      url: "/api/cpq/quotes/q1/proposal-pdf",
      filename: "propuesta.pdf",
      mimeType: "application/pdf",
    });

    expect(result.method).toBe("share");
    expect(share).toHaveBeenCalledTimes(1);
    const payload = share.mock.calls[0]![0] as { files: File[]; title: string };
    expect(payload.title).toBe("propuesta.pdf");
    expect(payload.files[0]?.name).toBe("propuesta.pdf");
  });

  it("en desktop descarga al disco aunque exista Web Share API", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      canShare: vi.fn().mockReturnValue(true),
      share,
    });
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    const createObjectURL = vi.fn().mockReturnValue("blob:mock");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

    const click = vi.fn();
    const appendChild = vi.spyOn(document.body, "appendChild").mockImplementation((node) => {
      if (node instanceof HTMLAnchorElement) {
        Object.defineProperty(node, "click", { value: click });
      }
      return node;
    });
    const removeChild = vi.spyOn(HTMLElement.prototype, "remove").mockImplementation(() => undefined);

    const result = await downloadOrShareFile({
      url: "/api/cpq/quotes/q1/proposal-pdf",
      filename: "propuesta.pdf",
      mimeType: "application/pdf",
    });

    expect(result.method).toBe("download");
    expect(share).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalled();

    appendChild.mockRestore();
    removeChild.mockRestore();
  });

  it("con preferShare true fuerza share también en desktop", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      canShare: vi.fn().mockReturnValue(true),
      share,
    });
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation(() => ({
        matches: false,
        media: "",
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );

    const result = await downloadOrShareFile({
      url: "/api/cpq/quotes/q1/proposal-pdf",
      filename: "propuesta.pdf",
      mimeType: "application/pdf",
      preferShare: true,
    });

    expect(result.method).toBe("share");
    expect(share).toHaveBeenCalledTimes(1);
  });

  it("cae a descarga con object URL si no hay share", async () => {
    const createObjectURL = vi.fn().mockReturnValue("blob:mock");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    vi.stubGlobal("navigator", {});

    const click = vi.fn();
    const appendChild = vi.spyOn(document.body, "appendChild").mockImplementation((node) => {
      if (node instanceof HTMLAnchorElement) {
        Object.defineProperty(node, "click", { value: click });
      }
      return node;
    });
    const removeChild = vi.spyOn(HTMLElement.prototype, "remove").mockImplementation(() => undefined);

    const result = await downloadOrShareFile({
      url: "/api/cpq/quotes/q1/proposal-pdf",
      filename: "propuesta.pdf",
    });

    expect(result.method).toBe("download");
    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();

    appendChild.mockRestore();
    removeChild.mockRestore();
  });

  it("propaga el error de la API cuando el fetch falla", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ error: "Propuesta no aprobada" }),
      }),
    );
    vi.stubGlobal("navigator", {});

    await expect(
      downloadOrShareFile({
        url: "/api/cpq/quotes/q1/proposal-pdf?mode=final",
        filename: "propuesta.pdf",
      }),
    ).rejects.toThrow("Propuesta no aprobada");
  });
});
