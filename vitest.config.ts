import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        url: "http://localhost/portal/cliente",
      },
    },
    setupFiles: ["./src/test-setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // `server-only` es un módulo marcador de Next.js que no es resolvible en
      // entornos de test. Lo neutralizamos a un módulo vacío.
      "server-only": path.resolve(__dirname, "./src/test-stubs/server-only.ts"),
    },
  },
  esbuild: {
    jsxImportSource: "react",
    jsx: "automatic",
  },
});
