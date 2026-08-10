/** Mapeo pathKey v1 (plano) → v2 (por módulo). Puro, testeable. */

export function mapPathKeyV1toV2(key: string): string {
  const k = key.trim();
  if (!k) return k;
  if (
    k === "Comercial" ||
    k.startsWith("Comercial/") ||
    k === "Personas" ||
    k.startsWith("Personas/") ||
    k === "Operaciones" ||
    k.startsWith("Operaciones/")
  ) {
    return k;
  }

  if (k === "Clientes" || k.startsWith("Clientes/")) {
    const rest = k === "Clientes" ? "" : k.slice("Clientes/".length);
    const parts = rest.split("/").filter(Boolean);
    // Clientes/{Cuenta}/Personas/{Contacto} → Contactos
    if (parts.length >= 2 && parts[1] === "Personas") {
      parts[1] = "Contactos";
    }
    const body = parts.join("/");
    return body ? `Comercial/Cuentas/${body}` : "Comercial/Cuentas";
  }

  if (k === "Negocios" || k.startsWith("Negocios/")) {
    return k === "Negocios" ? "Comercial/Negocios" : `Comercial/${k}`;
  }
  if (k === "Licitaciones" || k.startsWith("Licitaciones/")) {
    return k === "Licitaciones" ? "Comercial/Licitaciones" : `Comercial/${k}`;
  }
  return k;
}

export function mapTargetPathV1toV2(path: string): string {
  return mapPathKeyV1toV2(path);
}
