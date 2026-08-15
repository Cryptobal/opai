/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PortalBottomNav } from "../PortalBottomNav";

describe("PortalBottomNav", () => {
  it("renders four equal tabs without elevated panic", () => {
    render(<PortalBottomNav activeScreen="chat" onNavigate={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Rondas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Chat" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Incidente" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Perfil" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pánico" })).toBeNull();
    expect(screen.queryByRole("button", { name: /pánico/i })).toBeNull();
  });
});
