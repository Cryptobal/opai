import type { CapacitorConfig } from "@capacitor/core";

const config: CapacitorConfig = {
  appId: "cl.gard.opai",
  appName: "OPAI",
  webDir: "out",
  server: {
    url: "https://opai.gard.cl",
    allowNavigation: ["opai.gard.cl", "*.gard.cl"],
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
