import { describe, expect, it } from "vitest";
import {
  hasValidInstallationCoords,
  validateGeoreferencedAddress,
} from "@/lib/crm/installation-address";

describe("installation-address", () => {
  it("acepta coordenadas válidas de Chile", () => {
    expect(hasValidInstallationCoords(-34.06, -70.76)).toBe(true);
  });

  it("rechaza 0,0 y valores nulos", () => {
    expect(hasValidInstallationCoords(0, 0)).toBe(false);
    expect(hasValidInstallationCoords(null, -70)).toBe(false);
    expect(hasValidInstallationCoords(-34, undefined)).toBe(false);
  });

  it("permite dirección vacía sin coordenadas", () => {
    expect(validateGeoreferencedAddress({ address: "", lat: null, lng: null })).toBeNull();
    expect(validateGeoreferencedAddress({ address: "  ", lat: 0, lng: 0 })).toBeNull();
  });

  it("exige Google Maps cuando hay texto de dirección", () => {
    expect(
      validateGeoreferencedAddress({ address: "Alameda", lat: null, lng: null })
    ).toBe("Debes seleccionar la dirección desde Google Maps");
    expect(
      validateGeoreferencedAddress({ address: "Alameda", lat: 0, lng: 0 })
    ).toBe("Debes seleccionar la dirección desde Google Maps");
  });

  it("acepta dirección con coordenadas válidas", () => {
    expect(
      validateGeoreferencedAddress({
        address: "Javiera Carrera 425, Rancagua",
        lat: -34.17,
        lng: -70.74,
      })
    ).toBeNull();
  });
});
