import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentShareButton } from "../DocumentShareButton";

vi.mock("@/lib/files/download-or-share", () => ({
  downloadOrShareFile: vi.fn().mockResolvedValue({ method: "share" }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("DocumentShareButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dispara downloadOrShareFile al tocar Compartir", async () => {
    const { downloadOrShareFile } = await import("@/lib/files/download-or-share");
    render(
      <DocumentShareButton
        url="/api/cpq/quotes/q1/export-pdf"
        filename="cotizacion.pdf"
        mimeType="application/pdf"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Compartir" }));

    await waitFor(() => {
      expect(downloadOrShareFile).toHaveBeenCalledWith({
        url: "/api/cpq/quotes/q1/export-pdf",
        filename: "cotizacion.pdf",
        mimeType: "application/pdf",
        preferShare: true,
      });
    });
  });
});
