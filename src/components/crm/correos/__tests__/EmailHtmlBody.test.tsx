/**
 * Tests de EmailHtmlBody — iframe sandbox (V5) y botón "Mostrar imágenes" (V4).
 *
 * Cubre:
 *  - El cuerpo HTML se renderiza en <iframe sandbox> sin allow-scripts.
 *  - buildEmailSrcDoc genera documento completo con estilos base.
 *  - El botón "Mostrar imágenes" aparece solo con imágenes remotas bloqueadas
 *    y alterna a "Ocultar imágenes" (estado de sesión).
 *  - Sin HTML cae al texto plano.
 */
import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { buildEmailSrcDoc, EmailHtmlBody } from "../EmailHtmlBody";

const HTML_CON_IMG = '<p>Hola</p><img src="https://cdn.example.com/banner.png">';
const HTML_SIN_IMG = "<p>Solo texto enriquecido</p>";

describe("EmailHtmlBody", () => {
  it("renderiza iframe sandbox sin allow-scripts", () => {
    const { container } = render(
      <EmailHtmlBody htmlBody={HTML_SIN_IMG} textBody={null} />,
    );
    const iframe = container.querySelector("iframe");
    expect(iframe).toBeTruthy();
    const sandbox = iframe?.getAttribute("sandbox") ?? "";
    expect(sandbox).toContain("allow-same-origin");
    expect(sandbox).toContain("allow-popups");
    expect(sandbox).not.toContain("allow-scripts");
    expect(iframe?.getAttribute("srcdoc")).toContain("Solo texto enriquecido");
  });

  it("muestra el botón Mostrar imágenes solo cuando hay remotas bloqueadas", () => {
    render(<EmailHtmlBody htmlBody={HTML_CON_IMG} textBody={null} />);
    expect(screen.getByText("Mostrar imágenes")).toBeTruthy();
  });

  it("no muestra el botón si el HTML no tiene imágenes remotas", () => {
    render(<EmailHtmlBody htmlBody={HTML_SIN_IMG} textBody={null} />);
    expect(screen.queryByText("Mostrar imágenes")).toBeNull();
  });

  it("al hacer clic restaura los src y alterna a Ocultar imágenes", () => {
    const { container } = render(
      <EmailHtmlBody htmlBody={HTML_CON_IMG} textBody={null} />,
    );
    expect(container.querySelector("iframe")?.getAttribute("srcdoc")).toContain(
      "data-blocked-src=",
    );
    fireEvent.click(screen.getByText("Mostrar imágenes"));
    const srcdoc = container.querySelector("iframe")?.getAttribute("srcdoc") ?? "";
    expect(srcdoc).toContain('src="https://cdn.example.com/banner.png"');
    expect(srcdoc).not.toContain("data-blocked-src=");
    expect(screen.getByText("Ocultar imágenes")).toBeTruthy();
  });

  it("sin HTML renderiza el texto plano", () => {
    render(<EmailHtmlBody htmlBody={null} textBody={"hola\nmundo"} />);
    expect(screen.getByText(/hola/)).toBeTruthy();
  });
});

describe("buildEmailSrcDoc", () => {
  it("genera un documento completo con estilos base y el HTML embebido", () => {
    const doc = buildEmailSrcDoc("<p>contenido</p>");
    expect(doc).toContain("<!doctype html>");
    expect(doc).toContain("color-scheme:light");
    expect(doc).toContain('<base target="_blank">');
    expect(doc).toContain("<p>contenido</p>");
  });

  it("en modo noche fuerza texto claro (pisando color negro inline de correos)", () => {
    const doc = buildEmailSrcDoc('<p style="color:#000">Hola</p>', true);
    expect(doc).toContain("color-scheme:dark");
    expect(doc).toContain("hsl(210 40% 96%)");
    expect(doc).toContain("color:hsl(210 40% 96%)!important");
    expect(doc).toContain("hsl(174 72% 55%)");
  });
});
