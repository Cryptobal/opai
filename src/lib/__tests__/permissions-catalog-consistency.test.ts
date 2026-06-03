import { describe, it, expect } from "vitest";
import {
  MODULE_KEYS,
  SUBMODULE_KEYS,
  SUBMODULE_META,
  type ModuleKey,
} from "../permissions";

/**
 * El validador de role-templates (PUT /api/admin/role-templates/[id]) rechaza
 * cualquier submódulo que no esté en SUBMODULE_KEYS. La UI, en cambio, renderiza
 * lo que está en SUBMODULE_META. Si ambos catálogos se desincronizan, la UI
 * permite marcar un permiso que el backend rechaza con 400
 * ("Submódulo desconocido: ... en módulo ...").
 *
 * Este test bloquea esa clase de bug: todo lo que aparece en META debe existir
 * como key válida, y toda key debería tener su META para poder mostrarse.
 */
describe("permissions catalog consistency", () => {
  it("every SUBMODULE_META entry has a matching key in SUBMODULE_KEYS", () => {
    const orphans = SUBMODULE_META.filter((m) => {
      if (!MODULE_KEYS.includes(m.module as ModuleKey)) return true;
      const validSubs = SUBMODULE_KEYS[m.module as ModuleKey] as readonly string[];
      return !validSubs.includes(m.submodule);
    }).map((m) => m.key);

    expect(orphans).toEqual([]);
  });

  it("every SUBMODULE_KEYS entry has a matching SUBMODULE_META row", () => {
    const metaKeys = new Set(SUBMODULE_META.map((m) => `${m.module}.${m.submodule}`));
    const missing: string[] = [];
    for (const mod of MODULE_KEYS) {
      for (const sub of SUBMODULE_KEYS[mod] as readonly string[]) {
        const key = `${mod}.${sub}`;
        if (!metaKeys.has(key)) missing.push(key);
      }
    }

    expect(missing).toEqual([]);
  });
});
