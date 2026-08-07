import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { CpqPdfPreviewPanel } from "../CpqPdfPreviewPanel";

describe("CpqPdfPreviewPanel", () => {
  afterEach(() => {
    document.body.style.overflow = "";
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
    expect(screen.getByText("PDF y documentos")).toBeInTheDocument();
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

  it("Ver genera y abre el visor a pantalla completa con la URL generada", async () => {
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
    expect(await screen.findByRole("dialog", { name: "Vista previa de la propuesta" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agrandar" })).toBeInTheDocument();
  });

  it("pantalla completa abre visor con zoom", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Ver pantalla completa" }));

    expect(await screen.findByRole("dialog", { name: "Vista previa de la propuesta" })).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Agrandar" }));
    expect(screen.getByText("120%")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Achicar" }));
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("Ver con previewUrl abre el mismo visor fullscreen", async () => {
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

    expect(await screen.findByRole("dialog", { name: "Vista previa de la propuesta" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agrandar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Achicar" })).toBeInTheDocument();
  });
});
