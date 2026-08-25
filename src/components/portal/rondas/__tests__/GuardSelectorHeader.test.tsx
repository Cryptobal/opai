/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GuardSelectorHeader } from "../GuardSelectorHeader";

describe("GuardSelectorHeader", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({
          success: true,
          data: [
            { id: "g1", name: "Ana Pérez" },
            { id: "g2", name: "Luis Soto" },
          ],
        }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("muestra el nombre del guardia actual para poder cambiarlo", async () => {
    render(
      <GuardSelectorHeader
        installationName="Mall Plaza"
        deviceToken="token"
        currentGuardId="g1"
        currentGuardName="Ana Pérez"
        onGuardChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Mall Plaza")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ana pérez/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole("button", { name: /ana pérez/i }));

    await waitFor(() => {
      expect(screen.getByText("Luis Soto")).toBeInTheDocument();
    });
  });

  it("queda en flujo (relative) para no quedar bajo la barra GPS/SOS", async () => {
    const { container } = render(
      <GuardSelectorHeader
        installationName="Mall Plaza"
        deviceToken="token"
        currentGuardId="g1"
        currentGuardName="Ana Pérez"
        onGuardChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toMatch(/\brelative\b/);
    expect(root.className).toMatch(/\bshrink-0\b/);
    expect(root.className).toMatch(/z-\[45\]/);
  });
});
