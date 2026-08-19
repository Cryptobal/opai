import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { BundleProposalPreview } from "../BundleProposalPreview";
import type { BundleDetail } from "@/components/cpq/bundle/useBundle";

vi.mock("@/components/crm/correos/AttachmentPreview", () => ({
  AttachmentPreview: () => <div data-testid="attachment-preview" />,
}));

const bundle = {
  id: "b1",
  code: "PROP-2026-004",
  name: "Elecnor",
  status: "sent",
  totals: { includedCount: 2 },
} as BundleDetail;

describe("BundleProposalPreview gate CTA", () => {
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
        dispatchEvent: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("muestra Completar con IA y reintenta el PDF tras generate_missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/proposal-pdf")) {
        if (fetchMock.mock.calls.filter((c) => String(c[0]).includes("/proposal-pdf")).length > 1) {
          return new Response(new Blob(["%PDF"], { type: "application/pdf" }), {
            status: 200,
            headers: { "content-type": "application/pdf" },
          });
        }
        return new Response(
          JSON.stringify({
            success: false,
            error: "El PDF final exige completar estas secciones: Carta Gantt, Exclusiones y supuestos.",
          }),
          { status: 422, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/proposal-sections") && init?.method === "PATCH") {
        return new Response(JSON.stringify({ success: true, data: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    render(<BundleProposalPreview bundle={bundle} referenceQuoteId="ref-quote" />);
    fireEvent.click(screen.getByRole("button", { name: "Generar PDF" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Completar con IA/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Completar con IA/i }));

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(
        (c) => String(c[0]).includes("/proposal-sections") && c[1]?.method === "PATCH",
      );
      expect(patch).toBeTruthy();
      expect(JSON.parse(String(patch![1]?.body))).toEqual({ action: "generate_missing" });
      expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes("/proposal-pdf")).length).toBeGreaterThanOrEqual(
        2,
      );
    });
  });
});
