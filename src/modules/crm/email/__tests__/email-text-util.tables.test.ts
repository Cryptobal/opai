import { describe, expect, it } from "vitest";
import { htmlToTextWithTables, stripHtml } from "../email-text-util";

describe("htmlToTextWithTables", () => {
  it("preserva tabla tipo pliego (4 filas × 6 columnas) como markdown", () => {
    const html = `
      <p>Estimados, adjunto cobertura:</p>
      <table>
        <tr>
          <th>Frente</th><th>Etapa</th><th>Período</th>
          <th>Cobertura</th><th>N°</th><th>Notas</th>
        </tr>
        <tr>
          <td>Pique Estación Brasil</td><td>Etapa 1</td>
          <td>01-sep-26 → 30-sep-26</td>
          <td>Diurno 12h + rondín nocturno</td><td>1</td><td></td>
        </tr>
        <tr>
          <td>Pique Estación Brasil / Planta Dovelas</td><td>Etapa 2</td>
          <td>01-sep-26 → 30-sep-26</td>
          <td>Diurno 12h + rondín nocturno</td><td>1 por frente</td><td>paralelo</td>
        </tr>
        <tr>
          <td>Pique Brasil, Pique Gutiérrez y Túnel Estación</td><td>Etapa 3A</td>
          <td>01-oct-26 → 30-nov-26</td>
          <td>24/7 — 2 turnos 12h</td><td>1 por turno y por frente</td><td></td>
        </tr>
        <tr>
          <td>Pique Estación y Planta Dovelas</td><td>Etapa 3B</td>
          <td>15-nov-26 → 29-ene-27</td>
          <td>24/7 reforzado en pique</td><td>2 pique / 1 Dovelas</td><td></td>
        </tr>
      </table>
      <p>Saludos</p>
    `;

    const text = htmlToTextWithTables(html);
    const lines = text.split("\n").filter((l) => l.startsWith("|"));

    expect(lines).toHaveLength(5); // header + 4 data rows
    expect(lines[0]).toContain("Frente");
    expect(lines[0]).toContain("Etapa");
    expect(lines[1]).toMatch(/Pique Estación Brasil/);
    expect(lines[1]).toMatch(/Etapa 1/);
    expect(lines[1]).toMatch(/Diurno 12h \+ rondín nocturno/);
    expect(lines[2]).toMatch(/Etapa 2/);
    expect(lines[2]).toMatch(/Planta Dovelas/);
    expect(lines[3]).toMatch(/Etapa 3A/);
    expect(lines[3]).toMatch(/Pique Gutiérrez/);
    expect(lines[4]).toMatch(/Etapa 3B/);
    expect(lines[4]).toMatch(/29-ene-27/);

    // Cada fila conserva celdas en orden (6 columnas → 7 pipes).
    for (const line of lines) {
      const pipes = (line.match(/\|/g) || []).length;
      expect(pipes).toBe(7);
    }

    expect(text).toMatch(/Estimados/);
    expect(text).toMatch(/Saludos/);
  });

  it("omite tabla vacía y no rompe el resto", () => {
    const html = `<p>Hola</p><table><tr></tr></table><p>Chao</p>`;
    const text = htmlToTextWithTables(html);
    expect(text).toMatch(/Hola/);
    expect(text).toMatch(/Chao/);
    expect(text).not.toMatch(/\|/);
  });

  it("sin tablas equivale a stripHtml en contenido", () => {
    const html = `<p>Solo <b>texto</b> plano</p>`;
    expect(htmlToTextWithTables(html)).toBe(stripHtml(html));
  });
});
