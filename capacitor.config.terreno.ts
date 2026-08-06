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
  backgroundColor: "#060a13",
  server: {
    url: "https://www.opai.cl/app-boot.html?to=/portal/terreno",
    allowNavigation: [
      "www.opai.cl",
      "opai.gard.cl",
      "*.opai.cl",
    ],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 20000, // red de seguridad; el hide real lo hace el JS
      launchAutoHide: true, // nunca dejar el splash pegado
      backgroundColor: "#060a13",
      showSpinner: true,
      androidSpinnerStyle: "large",
      iosSpinnerStyle: "small",
      spinnerColor: "#14b8a6",
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#060a13",
    },
  },
};

export default config;
