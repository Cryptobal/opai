import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { CpqPdfPreviewPanel } from "../CpqPdfPreviewPanel";

describe("CpqPdfPreviewPanel", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("separa tipo de PDF y formato de cotizacion", () => {
    render(
      <CpqPdfPreviewPanel
        mode="cotizacion"
        templateSlug="standard"
        previewUrl={null}
        loading={false}
        onModeChange={vi.fn()}
        onTemplateSlugChange={vi.fn()}
        onGenerate={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Cotización" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Propuesta técnica" })).toBeInTheDocument();
    expect(screen.getByText("Formato de cotización")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Estándar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Detallado" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Licitación" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver" })).toBeInTheDocument();
  });

  it("oculta formatos de cotizacion cuando se elige presentacion", () => {
    const onModeChange = vi.fn();
    render(
      <CpqPdfPreviewPanel
        mode="cotizacion"
        templateSlug="standard"
        previewUrl={null}
        loading={false}
        onModeChange={onModeChange}
        onTemplateSlugChange={vi.fn()}
        onGenerate={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Propuesta técnica" }));

    expect(onModeChange).toHaveBeenCalledWith("presentacion");
  });

  it("Ver genera y abre el visor cuando aún no hay preview", async () => {
    const onGenerate = vi.fn().mockResolvedValue("/api/cpq/quotes/q1/export-pdf?t=1");
    render(
      <CpqPdfPreviewPanel
        mode="cotizacion"
        templateSlug="standard"
        previewUrl={null}
        loading={false}
        onModeChange={vi.fn()}
        onTemplateSlugChange={vi.fn()}
        onGenerate={onGenerate}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Ver" }));

    await waitFor(() => {
      expect(onGenerate).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText("Vista previa · Cotización")).toBeInTheDocument();
  });

  it("en pointer coarse Ver abre pestaña nativa sin forzar descarga", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("pointer: coarse"),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    render(
      <CpqPdfPreviewPanel
        mode="presentacion"
        templateSlug="standard"
        previewUrl="/api/cpq/quotes/q1/proposal-pdf?t=1"
        loading={false}
        onModeChange={vi.fn()}
        onTemplateSlugChange={vi.fn()}
        onGenerate={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Ver" }));

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith(
        "/api/cpq/quotes/q1/proposal-pdf?t=1",
        "_blank",
        "noopener,noreferrer",
      );
    });

    openSpy.mockRestore();
  });
});
