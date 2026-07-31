import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Default Capacitor config — selects between the apps via env var.
 *
 * Four configs (three publicables + Personas retained for local workflows):
 *
 *   CAPACITOR_APP=terreno  npx cap sync   # Opai Terreno  (cl.opai.terreno)
 *   CAPACITOR_APP=personas npx cap sync   # Opai Personas (cl.opai.personas)
 *   CAPACITOR_APP=erp      npx cap sync   # Opai ERP      (cl.opai.erp)
 *   CAPACITOR_APP=cliente  npx cap sync   # Opai Clientes (cl.opai.cliente)
 *
 * Default (no env var): personas — the most common local workflow.
 *
 * Prefer the dedicated npm scripts in package.json:
 *   npm run cap:terreno:sync
 *   npm run cap:personas:sync
 *   npm run cap:erp:sync
 *   npm run cap:cliente:sync
 *
 * iOS variants:
 *   npm run cap:<app>:ios:init     # one-time npx cap add ios
 *   npm run cap:<app>:ios:sync     # sync Xcode project
 *   npm run cap:<app>:ios:open     # open in Xcode
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const app = process.env.CAPACITOR_APP || "personas";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const loaded =
  app === "terreno"
    ? require("./capacitor.config.terreno")
    : app === "erp"
      ? require("./capacitor.config.erp")
      : app === "cliente"
        ? require("./capacitor.config.cliente")
        : require("./capacitor.config.personas");

const config: CapacitorConfig = loaded.default ?? loaded;

export default config;
