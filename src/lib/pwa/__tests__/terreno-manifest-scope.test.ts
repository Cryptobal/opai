/**
 * @vitest-environment node
 *
 * Guarda el contrato PWA del cluster Terreno: marcación / rondas / acceso
 * deben compartir `scope: "/portal"` (como manifest-terreno) para que el
 * TerrenoModeSwitcher no expulse iOS del modo standalone al cruzar portales.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readManifest(name: string): { scope: string; start_url: string; id?: string } {
  const raw = readFileSync(resolve(process.cwd(), "public", name), "utf8");
  return JSON.parse(raw) as { scope: string; start_url: string; id?: string };
}

describe("Terreno PWA manifest scopes", () => {
  const triad = [
    { file: "manifest-marcacion.json", start: "/portal/marcacion" },
    { file: "portal-rondas-manifest.json", start: "/portal/rondas" },
    { file: "manifest-acceso.json", start: "/portal/acceso" },
  ] as const;

  it("shares navigation scope /portal across marcación, rondas and acceso", () => {
    for (const entry of triad) {
      const m = readManifest(entry.file);
      expect(m.scope, entry.file).toBe("/portal");
      expect(m.start_url, entry.file).toBe(entry.start);
    }
  });

  it("matches the Terreno hub scope so hub ↔ sub-apps stay standalone", () => {
    const terreno = readManifest("manifest-terreno.json");
    expect(terreno.scope).toBe("/portal");
    for (const entry of triad) {
      expect(readManifest(entry.file).scope).toBe(terreno.scope);
    }
  });
});
