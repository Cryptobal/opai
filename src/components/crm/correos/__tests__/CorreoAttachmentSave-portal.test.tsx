/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CorreoAttachmentSave } from "../CorreoAttachmentSave";
import { CorreoReaderOverlayContext } from "../CorreoReaderOverlayContext";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

describe("CorreoAttachmentSave portal", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/attachments/save")) {
          return {
            ok: true,
            json: async () => ({
              results: [{ filename: "plano.kmz", status: "saved", fileId: "f1" }],
            }),
          } as Response;
        }
        if (url.includes("deals-for-account")) {
          return { ok: true, json: async () => ({ items: [{ id: "d1", title: "Negocio" }] }) } as Response;
        }
        if (url.includes("/api/crm/folders")) {
          return { ok: true, json: async () => ({ success: true, data: [] }) } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("con overlayHost null (Copiloto) monta en body y el Guardar dispara el POST", async () => {
    const onSaved = vi.fn();

    render(
      <CorreoReaderOverlayContext.Provider value={null}>
        <CorreoAttachmentSave
          open
          onClose={() => {}}
          threadId="t1"
          items={[{ messageId: "m1", attachmentId: "a1", filename: "plano.kmz", size: 1000 }]}
          accountId="acc1"
          accountName="Kalpataru"
          dealId="d1"
          dealTitle="Negocio"
          onSaved={onSaved}
        />
      </CorreoReaderOverlayContext.Provider>,
    );

    const dialog = await screen.findByRole("heading", { name: /Guardar 1 adjunto/i });
    expect(document.body.contains(dialog)).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Guardar en/i }));

    await waitFor(() => {
      const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
      const saveCall = calls.find((c) => String(c[0]).includes("/attachments/save"));
      expect(saveCall).toBeTruthy();
      expect((saveCall?.[1] as RequestInit | undefined)?.method).toBe("POST");
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("placement inline renderiza embebido sin portal fixed fullscreen", async () => {
    render(
      <CorreoAttachmentSave
        open
        onClose={() => {}}
        threadId="t1"
        items={[{ messageId: "m1", attachmentId: "a1", filename: "plano.kmz", size: 1000 }]}
        accountId="acc1"
        accountName="Kalpataru"
        dealId="d1"
        dealTitle="Negocio"
        onSaved={vi.fn()}
        placement="inline"
      />,
    );

    const region = await screen.findByRole("region", { name: /Guardar adjuntos/i });
    expect(region).toBeTruthy();
    expect(region.className).toContain("rounded-xl");
    // No envuelve con fixed inset-0 (fullscreen sobre la app).
    expect(region.closest(".fixed")).toBeNull();
  });
});

