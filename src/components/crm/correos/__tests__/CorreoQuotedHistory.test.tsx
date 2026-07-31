import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CorreoQuotedHistory } from "../CorreoQuotedHistory";

describe("CorreoQuotedHistory", () => {
  it("no renderiza si html vacío", () => {
    const { container } = render(<CorreoQuotedHistory html="  " />);
    expect(container.firstChild).toBeNull();
  });

  it("expandido por defecto muestra el historial", () => {
    render(<CorreoQuotedHistory html="<p>Mensaje citado</p>" />);
    expect(screen.getByText("Historial")).toBeTruthy();
    expect(screen.getByText("Mensaje citado")).toBeTruthy();
  });

  it("al colapsar desmonta el HTML (render diferido)", () => {
    render(<CorreoQuotedHistory html="<p>Mensaje citado</p>" />);
    fireEvent.click(screen.getByRole("button", { name: /Historial/i }));
    expect(screen.queryByText("Mensaje citado")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Historial/i }));
    expect(screen.getByText("Mensaje citado")).toBeTruthy();
  });
});
