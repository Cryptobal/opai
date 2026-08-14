import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { McpKeyCreatedModal } from "../McpKeyCreatedModal";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const REAL_KEY = `opai_mcp_${"A".repeat(40)}`;

describe("McpKeyCreatedModal", () => {
  it("muestra snippets rellenos y copiables sin pedir input", () => {
    render(
      <McpKeyCreatedModal plainKey={REAL_KEY} baseUrl="https://www.opai.cl" onClose={() => {}} />,
    );
    expect(screen.getByText("Tu API key")).toBeTruthy();
    expect(screen.getByText(new RegExp(`/api/mcp/${REAL_KEY}`))).toBeTruthy();
    expect(screen.queryByText(/TU_API_KEY/)).toBeNull();
    expect(screen.getAllByRole("button", { name: "Copiar" }).length).toBeGreaterThanOrEqual(4);
  });
});
