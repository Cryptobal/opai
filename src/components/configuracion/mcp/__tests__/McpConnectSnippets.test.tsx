import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { McpConnectSnippets } from "../McpConnectSnippets";

const REAL_KEY = `opai_mcp_${"A".repeat(40)}`;
const BASE = "https://www.opai.cl";

describe("McpConnectSnippets", () => {
  it("sin key real muestra placeholder y no ofrece copiar", () => {
    render(<McpConnectSnippets apiKey="" baseUrl={BASE} hasRealKey={false} />);
    expect(screen.getAllByText(/TU_API_KEY/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/no se pueden copiar/i)).toBeTruthy();
  });

  it("con key real rellena snippets copiables sin placeholder", () => {
    render(<McpConnectSnippets apiKey={REAL_KEY} baseUrl={BASE} hasRealKey />);
    expect(screen.getByText(new RegExp(`${BASE}/api/mcp/${REAL_KEY}`))).toBeTruthy();
    expect(screen.queryByText(/TU_API_KEY/)).toBeNull();
    expect(screen.getAllByRole("button", { name: "Copiar" }).length).toBe(4);
  });
});
