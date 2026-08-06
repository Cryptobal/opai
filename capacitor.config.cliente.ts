import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor config — Opai Clientes
 *
 * Personal device app for end-client contacts (Portal Cliente):
 *   - Dashboard, instalaciones, tickets, reportes
 *   - Auth: email + PIN (UnifiedLoginCard mode="cliente")
 *   - Also offers Google OAuth via /api/portal/auth/unified-google
 *     (hidden on iOS native for App Store guideline 4.8)
 *
 * PushNotifications enabled — each install belongs to one contact.
 *
 * Intended distribution:
 *   - Google Play     (appId cl.opai.cliente, "Opai Clientes")
 *   - Apple App Store (bundleId cl.opai.cliente, "Opai Clientes")
 */
const config: CapacitorConfig = {
  appId: "cl.opai.cliente",
  appName: "Opai Clientes",
  webDir: "out",
  backgroundColor: "#060a13",
  server: {
    url: "https://www.opai.cl/app-boot.html?to=/portal/cliente",
    allowNavigation: [
      "www.opai.cl",
      "opai.gard.cl",
      "*.opai.cl",
      "accounts.google.com", // Google OAuth (UnifiedLoginCard cliente; gated on iOS native)
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
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#060a13",
    },
  },
};

export default config;
