/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { CorreoReaderShell } from "../CorreoReaderShell";
import { CorreoReaderIsland } from "../CorreoReaderIsland";

const shellProps = {
  open: true,
  onClose: () => {},
  headerFrom: "remitente@ejemplo.cl",
  headerSubject: "Asunto",
  desktopWidth: 480,
  onResizePointerDown: () => {},
  onResizeKeyDown: () => {},
  onResizeReset: () => {},
};

function stubMatchMedia(narrow: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => {
      const q = String(query);
      const matches = narrow
        ? q.includes("max-width") || q.includes("pointer: coarse")
        : q.includes("pointer: coarse"); // iPad landscape: táctil pero ≥lg
      return {
        matches,
        media: q,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      };
    }),
  );
}

describe("CorreoReaderShell island clearance", () => {
  beforeEach(() => {
    stubMatchMedia(true);
    Object.defineProperty(navigator, "maxTouchPoints", {
      configurable: true,
      value: 5,
    });
    // Panel 700px; isla alta (200px) para forzar extra sobre el piso 184px.
    Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
      const el = this as HTMLElement;
      if (el.hasAttribute("data-correo-reader-island")) {
        return {
          top: 500,
          bottom: 700,
          left: 12,
          right: 360,
          width: 348,
          height: 200,
          x: 12,
          y: 500,
          toJSON: () => ({}),
        } as DOMRect;
      }
      return {
        top: 0,
        bottom: 700,
        left: 0,
        right: 390,
        width: 390,
        height: 700,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("aplica piso CSS de holgura en móvil (mails cortos / sin adjuntos)", () => {
    render(
      <CorreoReaderShell {...shellProps} mobileActions={null}>
        <p>Cuerpo corto sin adjuntos</p>
      </CorreoReaderShell>,
    );

    const content = document.querySelector("[data-correo-island-clearance]");
    expect(content).toBeTruthy();
    expect(content?.getAttribute("data-correo-island-clearance")).toBe("floor");
    // Piso CSS siempre presente — no depende de que la isla haya montado.
    expect(content?.className).toMatch(
      /pb-\[calc\(env\(safe-area-inset-bottom/,
    );
  });

  it("si la isla supera el piso, suma padding extra (no recorta)", async () => {
    render(
      <CorreoReaderShell
        {...shellProps}
        mobileActions={
          <CorreoReaderIsland
            primaryAction={{
              mode: "reply",
              label: "Responder",
              canReply: true,
              replyAllAvailable: true,
            }}
            composerOpen={false}
            onCompose={() => {}}
            topSlot={<button type="button">Sugerir respuestas</button>}
          />
        }
      >
        <p>Cuerpo del correo</p>
        <div data-testid="adjuntos">archivo.pdf</div>
      </CorreoReaderShell>,
    );

    await waitFor(() => {
      const content = document.querySelector("[data-correo-island-clearance]");
      expect(content).toBeTruthy();
      // needed = 700 - 500 + 24 = 224; floor 184 → extra 40
      expect(content?.getAttribute("data-correo-island-extra")).toBe("40");
      expect((content as HTMLElement).style.paddingBottom).toContain("40px");
    });
  });

  it("en viewport lg+ (iPad landscape) no aplica clearance ni monta isla", () => {
    stubMatchMedia(false);
    render(
      <CorreoReaderShell
        {...shellProps}
        desktopMode="split"
        mobileActions={
          <CorreoReaderIsland
            primaryAction={{
              mode: "reply",
              label: "Responder",
              canReply: true,
              replyAllAvailable: false,
            }}
            composerOpen={false}
            onCompose={() => {}}
          />
        }
      >
        <p>Cuerpo del correo</p>
      </CorreoReaderShell>,
    );

    expect(document.querySelector("[data-correo-island-clearance]")).toBeNull();
    expect(document.querySelector("[data-correo-reader-island]")).toBeNull();
    // Dock desktop montado para Responder (la isla no está en lg+).
    expect(document.querySelector("[data-correo-reader-scroller]")).toBeTruthy();
  });

  it("isla con rect 0 (oculta) no infla padding extra", async () => {
    Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
      const el = this as HTMLElement;
      if (el.hasAttribute("data-correo-reader-island")) {
        return {
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          width: 0,
          height: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      }
      return {
        top: 0,
        bottom: 700,
        left: 0,
        right: 390,
        width: 390,
        height: 700,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    };

    render(
      <CorreoReaderShell
        {...shellProps}
        mobileActions={
          <div data-correo-reader-island="" />
        }
      >
        <p>Cuerpo</p>
      </CorreoReaderShell>,
    );

    await waitFor(() => {
      const content = document.querySelector("[data-correo-island-clearance]");
      expect(content?.getAttribute("data-correo-island-extra")).toBe("0");
    });
  });
});
