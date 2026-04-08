import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor config — Opai Terreno
 *
 * Shared device (tablet) app used at installations for:
 *   - Marcación (attendance with Face ID)
 *   - Rondas (patrol checkpoints)
 *   - Control de Acceso (ingress/egress)
 *
 * Auth model: device pairing token (no personal login).
 * No PushNotifications plugin — shared devices don't receive personal push.
 */
const config: CapacitorConfig = {
  appId: "cl.opai.terreno",
  appName: "Opai Terreno",
  webDir: "out",
  server: {
    url: "https://www.opai.cl/portal/terreno",
    allowNavigation: [
      "www.opai.cl",
      "opai.gard.cl",
      "*.opai.cl",
    ],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#0a1628",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0a1628",
    },
  },
};

export default config;
