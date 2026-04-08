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
  server: {
    url: "https://www.opai.cl/portal/personas",
    allowNavigation: [
      "www.opai.cl",
      "opai.gard.cl",
      "*.opai.cl",
      "accounts.google.com", // Google OAuth (unified + NextAuth supervisor)
    ],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#0a1628",
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0a1628",
    },
  },
};

export default config;
