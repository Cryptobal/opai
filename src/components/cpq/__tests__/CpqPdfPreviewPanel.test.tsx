import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CpqPdfPreviewPanel } from "../CpqPdfPreviewPanel";

describe("CpqPdfPreviewPanel", () => {
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
});
