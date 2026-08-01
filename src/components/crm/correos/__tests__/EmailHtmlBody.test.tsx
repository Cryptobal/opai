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

  it("HTML no renderizable muestra fallback plano y no monta iframe", () => {
    const { container } = render(
      <EmailHtmlBody
        htmlBody={'<div dir="ltr"><br></div>'}
        textBody={null}
      />,
    );
    expect(container.querySelector("iframe")).toBeNull();
    expect(screen.getByText("(sin contenido)")).toBeTruthy();
  });
});

describe("buildEmailSrcDoc", () => {
  it("genera un documento completo con estilos base y el HTML embebido", () => {
    const doc = buildEmailSrcDoc("<p>contenido</p>");
    expect(doc).toContain("<!doctype html>");
    expect(doc).toContain("color-scheme:light");
    expect(doc).toContain('<base target="_blank">');
    expect(doc).toContain("opai-mail-canvas");
    expect(doc).toContain("<p>contenido</p>");
    // Padding en el canvas (no en body): si está en body y se mide
    // canvas.scrollHeight, el iframe corta ~32px del pie del mail.
    expect(doc).toMatch(/\.opai-mail-canvas\{[^}]*padding:16px 20px/);
    expect(doc).not.toMatch(/body\{[^}]*padding:16px 20px/);
    // Canvas al 100%: texto hace wrap; sin max-content (rompe wrap / tiritón).
    // overflow:hidden en html/body: el iframe mide al contenido → pan nativo
    // iOS encadena al scroller del shell (sin puente touch / touch-action:none).
    expect(doc).toContain("overflow-x:hidden");
    expect(doc).toContain("overflow:hidden");
    expect(doc).not.toContain("overscroll-behavior:none");
    expect(doc).not.toContain("touch-action:none");
    expect(doc).toMatch(/\.opai-mail-canvas\{[^}]*width:100%/);
    expect(doc).not.toMatch(/\.opai-mail-canvas\{[^}]*width:max-content/);
    expect(doc).not.toMatch(/table\{[^}]*overflow-x:auto/);
  });

  it("el scroller del lector expone data-correo-reader-scroller", async () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
    const { CorreoReaderShell } = await import("../CorreoReaderShell");
    const { container } = render(
      <CorreoReaderShell
        open
        onClose={() => {}}
        headerFrom="a@b.cl"
        headerSubject="Test"
        desktopWidth={480}
        onResizePointerDown={() => {}}
        onResizeKeyDown={() => {}}
        onResizeReset={() => {}}
        desktopMode="split"
        manageBackHistory={false}
      >
        <div>contenido</div>
      </CorreoReaderShell>,
    );
    expect(container.querySelector("[data-correo-reader-scroller]")).toBeTruthy();
  });

  it("expone toggle de ajuste de ancho en desktop (default: ajustar)", () => {
    render(<EmailHtmlBody htmlBody={HTML_SIN_IMG} textBody={null} />);
    expect(screen.getByText("Ancho original")).toBeTruthy();
  });

  it("en modo noche fuerza texto claro (pisando color negro inline de correos)", () => {
    const doc = buildEmailSrcDoc('<p style="color:#000">Hola</p>', true);
    expect(doc).toContain("color-scheme:dark");
    expect(doc).toContain("hsl(210 40% 96%)");
    expect(doc).toContain("color:hsl(210 40% 96%)!important");
    expect(doc).toContain("hsl(174 72% 55%)");
  });

  it("en modo noche reafirma el fondo del body tras el override transparente (anti negro UA)", () => {
    const doc = buildEmailSrcDoc("<p>Hola</p>", true);
    const transparentIdx = doc.indexOf(
      "background-color:transparent!important",
    );
    const bodyBgIdx = doc.indexOf(
      "body{background-color:hsl(218 32% 14%)!important}",
    );
    expect(transparentIdx).toBeGreaterThan(-1);
    expect(bodyBgIdx).toBeGreaterThan(transparentIdx);
    expect(doc).toContain("color-scheme:dark");
    expect(doc).toContain("hsl(218 24% 26%)");
  });

  it("en modo claro usa fondo blanco y no activa color-scheme dark", () => {
    const doc = buildEmailSrcDoc("<p>Hola</p>", false);
    expect(doc).toContain("background:hsl(0 0% 100%)");
    expect(doc).toContain("color-scheme:light");
    expect(doc).not.toContain("color-scheme:dark");
    expect(doc).not.toContain(
      "body{background-color:hsl(218 32% 14%)!important}",
    );
  });
});
