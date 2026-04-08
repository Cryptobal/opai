import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Default Capacitor config — selects between the two apps via env var.
 *
 * Usage:
 *   CAPACITOR_APP=terreno npx cap sync    # Opai Terreno (shared device)
 *   CAPACITOR_APP=opai    npx cap sync    # Opai (personal device, default)
 *
 * Prefer the dedicated npm scripts instead (see package.json):
 *   npm run cap:terreno:sync
 *   npm run cap:opai:sync
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const app = process.env.CAPACITOR_APP || "opai";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const loaded =
  app === "terreno"
    ? require("./capacitor.config.terreno")
    : require("./capacitor.config.opai");

const config: CapacitorConfig = loaded.default ?? loaded;

export default config;
