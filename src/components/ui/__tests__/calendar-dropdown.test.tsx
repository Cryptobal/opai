/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Calendar } from "@/components/ui/calendar";

describe("Calendar captionLayout dropdown", () => {
  it("renderiza comboboxes de mes y año por defecto (Radix)", () => {
    render(<Calendar mode="single" defaultMonth={new Date(2026, 7, 1)} />);

    const month = screen.getByRole("combobox", { name: /elegir el mes/i });
    const year = screen.getByRole("combobox", { name: /elegir el año/i });

    expect(month).toBeTruthy();
    expect(year).toBeTruthy();
    expect(month.textContent).toMatch(/agosto/i);
    expect(year.textContent).toMatch(/2026/);
  });

  it("mantiene flechas de mes junto a los dropdowns", () => {
    render(<Calendar mode="single" defaultMonth={new Date(2026, 7, 1)} />);

    expect(screen.getByRole("button", { name: /mes anterior/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /mes siguiente/i })).toBeTruthy();
  });

  it("permite desactivar dropdowns con captionLayout=label", () => {
    render(
      <Calendar mode="single" captionLayout="label" defaultMonth={new Date(2026, 7, 1)} />,
    );

    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
