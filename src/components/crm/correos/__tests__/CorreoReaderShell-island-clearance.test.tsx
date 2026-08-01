/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { CorreoReaderShell } from "../CorreoReaderShell";
import { CorreoReaderIsland } from "../CorreoReaderIsland";

describe("CorreoReaderShell island clearance", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: String(query).includes("max-width"),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    // getBoundingClientRect: panel 700px alto; isla ocupa los últimos 140px.
    Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
      const el = this as HTMLElement;
      if (el.hasAttribute("data-correo-reader-island")) {
        return {
          top: 560,
          bottom: 700,
          left: 12,
          right: 360,
          width: 348,
          height: 140,
          x: 12,
          y: 560,
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

  it("reserva padding-bottom ≥ distancia real a la isla (adjuntos no tapados)", async () => {
    render(
      <CorreoReaderShell
        open
        onClose={() => {}}
        headerFrom="remitente@ejemplo.cl"
        headerSubject="Asunto"
        desktopWidth={480}
        onResizePointerDown={() => {}}
        onResizeKeyDown={() => {}}
        onResizeReset={() => {}}
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
        <p>Adjunto el rol del servicio</p>
        <div data-testid="adjuntos">archivo.pdf</div>
      </CorreoReaderShell>,
    );

    await waitFor(() => {
      const content = document.querySelector("[data-correo-island-clearance]");
      expect(content).toBeTruthy();
      const clearance = Number(content?.getAttribute("data-correo-island-clearance"));
      // panelBottom 700 − islandTop 560 + gap 12 = 152
      expect(clearance).toBeGreaterThanOrEqual(152);
      expect((content as HTMLElement).style.paddingBottom).toBe(`${clearance}px`);
    });
  });
});
