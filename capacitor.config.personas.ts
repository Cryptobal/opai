import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor config — Opai Personas (personal device app)
 *
 * Personal device app used by individual users with a role:
 *   - Guardia      (pauta, solicitudes, documentos)
 *   - Supervisor   (equipo, instalaciones)
 *   - Cliente      (reportes, cotizaciones, incidentes)
 *
 * Auth model: NextAuth (supervisor) / guardia RUT+PIN / cliente email+PIN,
 * orchestrated by the hub at /portal/personas and the shared
 * UnifiedLoginCard component.
 *
 * PushNotifications are enabled because each install belongs to exactly
 * one person; notifications are per-user, not per-device.
 *
 * Intended distribution:
 *   - Google Play     (appId cl.opai.personas, "Opai Personas")
 *   - Apple App Store (bundleId cl.opai.personas, "Opai Personas")
 */
const config: CapacitorConfig = {
  appId: "cl.opai.personas",
  appName: "Opai Personas",
  webDir: "out",
  backgroundColor: "#060a13",
  server: {
    url: "https://www.opai.cl/app-boot.html?to=/portal/personas",
    allowNavigation: [
      "www.opai.cl",
      "opai.gard.cl",
      "*.opai.cl",
      "accounts.google.com", // Google OAuth (unified + NextAuth supervisor)
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
