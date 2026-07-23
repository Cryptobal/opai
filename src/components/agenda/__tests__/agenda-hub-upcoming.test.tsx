import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  AgendaHubUpcomingList,
  HUB_UPCOMING_MAX,
  upcomingAgendaItems,
} from "../AgendaHubUpcomingList";
import type { HubAgendaItem } from "../agenda-hub-item";

function ev(overrides: Partial<HubAgendaItem> & { id: string }): HubAgendaItem {
  return {
    source: "local",
    type: "visita",
    title: `Evento ${overrides.id}`,
    start: "2030-05-10T14:00:00.000Z",
    allDay: false,
    syncStatus: null,
    ...overrides,
  };
}

describe("upcomingAgendaItems", () => {
  const todayKey = "2030-05-10";

  it("excluye días pasados y ordena cronológicamente", () => {
    const items = upcomingAgendaItems(
      [
        ev({ id: "manana", start: "2030-05-11T09:00:00.000Z" }),
        ev({ id: "ayer", start: "2030-05-09T09:00:00.000Z" }),
        ev({ id: "hoy", start: "2030-05-10T18:00:00.000Z" }),
      ],
      todayKey,
    );
    expect(items.map((i) => i.id)).toEqual(["hoy", "manana"]);
  });

  it("limita a máximo 4 eventos próximos", () => {
    const items = upcomingAgendaItems(
      Array.from({ length: 9 }, (_, i) =>
        ev({ id: `e${i}`, start: `2030-05-1${(i % 5) + 1}T0${i}:00:00.000Z` }),
      ),
      todayKey,
    );
    expect(items).toHaveLength(HUB_UPCOMING_MAX);
  });

  it("los all-day (licitaciones) van primero dentro del día", () => {
    const items = upcomingAgendaItems(
      [
        ev({ id: "visita", start: "2030-05-11T09:00:00.000Z" }),
        ev({ id: "licitacion", start: "2030-05-11", allDay: true }),
      ],
      todayKey,
    );
    expect(items.map((i) => i.id)).toEqual(["licitacion", "visita"]);
  });
});

describe("AgendaHubUpcomingList", () => {
  it("renderiza lista vertical (sin grilla de columnas) con títulos truncables", () => {
    const { container } = render(
      <AgendaHubUpcomingList
        items={[
          ev({
            id: "x",
            start: "2030-05-11T09:00:00.000Z",
            title:
              "Título larguísimo de evento que debe truncarse dentro de su contenedor sin ensanchar la página",
          }),
        ]}
      />,
    );
    // Lista vertical: <ul> sin clases de grid de 3 columnas.
    const ul = container.querySelector("ul");
    expect(ul).toBeTruthy();
    expect(ul!.className).not.toContain("grid-cols-3");
    // Texto dinámico truncado + contenedores min-w-0 (sin overflow horizontal).
    expect(container.querySelector(".truncate")).toBeTruthy();
    expect(ul!.className).toContain("min-w-0");
  });

  it("deriva a la agenda completa en vez de reconstruir el calendario", () => {
    const { container } = render(
      <AgendaHubUpcomingList
        items={[ev({ id: "x", start: "2030-05-11T09:00:00.000Z" })]}
      />,
    );
    expect(
      container.querySelector('a[href="/opai/agenda"]'),
    ).toBeTruthy();
  });

  it("muestra el contexto del evento (tipo)", () => {
    render(
      <AgendaHubUpcomingList
        items={[
          ev({ id: "t", source: "tarea", start: "2030-05-11T09:00:00.000Z" }),
          ev({
            id: "g",
            source: "google",
            calendarName: "Trabajo",
            htmlLink: "https://calendar.google.com/x",
            start: "2030-05-11T10:00:00.000Z",
          }),
        ]}
      />,
    );
    expect(screen.getByText("Tarea")).toBeTruthy();
    expect(screen.getByText("Trabajo")).toBeTruthy();
  });
});
