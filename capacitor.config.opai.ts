import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor config — Opai (personal device app)
 *
 * Personal device app used by individual users:
 *   - Guardia (assigned shifts, documents, requests)
 *   - Supervisor (team management, installations)
 *   - Cliente (reports, quotes, incidents)
 *
 * Auth model: NextAuth session / guard RUT+PIN / cliente email+PIN
 * PushNotifications enabled for per-user notifications.
 *
 * Entry point is /portal/personal — a hub that auto-detects active sessions
 * and routes to the corresponding portal.
 */
const config: CapacitorConfig = {
  appId: "cl.opai.app",
  appName: "Opai",
  webDir: "out",
  server: {
    url: "https://www.opai.cl/portal/personal",
    allowNavigation: [
      "www.opai.cl",
      "opai.gard.cl",
      "*.opai.cl",
      "accounts.google.com", // Google OAuth for supervisor
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
