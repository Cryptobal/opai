/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Calendar } from "@/components/ui/calendar";

describe("Calendar captionLayout dropdown", () => {
  it("renderiza selects de mes y año por defecto", () => {
    render(<Calendar mode="single" defaultMonth={new Date(2026, 7, 1)} />);

    const monthSelect = screen.getByRole("combobox", { name: /elegir el mes/i });
    const yearSelect = screen.getByRole("combobox", { name: /elegir el año/i });

    expect(monthSelect).toBeTruthy();
    expect(yearSelect).toBeTruthy();
    expect(yearSelect.querySelectorAll("option").length).toBeGreaterThan(50);
  });

  it("incluye años futuros en el dropdown de año", () => {
    render(<Calendar mode="single" defaultMonth={new Date(2026, 7, 1)} />);

    const yearSelect = screen.getByRole("combobox", {
      name: /elegir el año/i,
    }) as HTMLSelectElement;
    const years = Array.from(yearSelect.options).map((o) => Number(o.value));
    const currentYear = new Date().getFullYear();

    expect(years).toContain(currentYear + 5);
    expect(years).toContain(currentYear - 50);
  });

  it("permite desactivar dropdowns con captionLayout=label", () => {
    render(
      <Calendar mode="single" captionLayout="label" defaultMonth={new Date(2026, 7, 1)} />,
    );

    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
