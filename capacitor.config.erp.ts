import type { CapacitorConfig } from "@capacitor/cli";
import { KeyboardResize } from "@capacitor/keyboard";

/**
 * Capacitor config — Opai ERP
 *
 * Full ERP app for administrators and back-office users:
 *   - Owners / admins
 *   - RRHH, Finanzas, Operaciones, Compliance
 *   - CPQ, CRM, Pipelines
 *
 * Auth model: NextAuth credentials + Google OAuth (existing `/opai/login`
 * flow, powered by src/lib/auth.ts).
 *
 * PushNotifications are enabled for admin alerts (SLA, novedades,
 * fiscalización, etc.).
 *
 * Intended distribution:
 *   - Google Play     (appId cl.opai.erp, "Opai ERP")
 *   - Apple App Store (bundleId cl.opai.erp, "Opai ERP")
 */
const config: CapacitorConfig = {
  appId: "cl.opai.erp",
  appName: "Opai ERP",
  webDir: "out",
  backgroundColor: "#060a13",
  server: {
    url: "https://www.opai.cl/opai/login",
    allowNavigation: [
      "www.opai.cl",
      "opai.gard.cl",
      "*.opai.cl",
      "accounts.google.com", // Google OAuth (NextAuth)
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
    // resize None: el composer fullscreen se ancla a visualViewport en JS.
    // accessoryBarVisible se apaga en runtime al abrir el composer (iOS).
    Keyboard: {
      resize: KeyboardResize.None,
    },
  },
};

export default config;
