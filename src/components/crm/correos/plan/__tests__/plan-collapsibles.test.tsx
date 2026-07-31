import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CorreoAiAssumptions } from "../CorreoAiAssumptions";
import { CorreoAiQuestions } from "../CorreoAiQuestions";
import type { CrmStructureAssumption } from "@/modules/crm/email/email-to-crm-structure.types";

const items: CrmStructureAssumption[] = [
  { id: "a1", text: "Turnos 12 h", originalText: "Turnos 12 h", origin: "inference" },
  { id: "a2", text: "Sin rondín", originalText: "Sin rondín", origin: "inference" },
];

describe("Supuestos / Preguntas colapsables", () => {
  afterEach(() => cleanup());

  it("Supuestos arranca colapsado con contador y explica su efecto al abrir", () => {
    render(<CorreoAiAssumptions items={items} onChange={vi.fn()} />);

    const toggle = screen.getByRole("button", { name: /Supuestos que apliqué \(2\)/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Turnos 12 h")).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Turnos 12 h")).toBeTruthy();
    expect(
      screen.getByText("Se guardan como nota de trazabilidad en el negocio."),
    ).toBeTruthy();
  });

  it("Preguntas arranca colapsado y avisa que responder re-analiza con IA", () => {
    render(
      <CorreoAiQuestions
        questions={["¿Cuántos turnos?", "¿Hay rondín?"]}
        remainingRefines={3}
        onAnswer={vi.fn()}
      />,
    );

    const toggle = screen.getByRole("button", { name: /Preguntas para afinar \(2\)/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("¿Cuántos turnos?")).toBeNull();

    fireEvent.click(toggle);
    expect(screen.getByText("¿Cuántos turnos?")).toBeTruthy();
    expect(
      screen.getByText(
        "Responder vuelve a analizar el correo con IA y actualiza el plan · quedan 3",
      ),
    ).toBeTruthy();
  });
});
