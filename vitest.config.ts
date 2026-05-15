import { defineConfig } from "vitest/config";
import path from "path";

const resolveAlias = {
  "@": path.resolve(__dirname, "./src"),
  // `server-only` es un módulo marcador de Next.js que no es resolvible en
  // entornos de test. Lo neutralizamos a un módulo vacío.
  "server-only": path.resolve(__dirname, "./src/test-stubs/server-only.ts"),
};

const esbuildJsx = {
  jsxImportSource: "react",
  jsx: "automatic" as const,
};

export default defineConfig({
  resolve: {
    alias: resolveAlias,
  },
  esbuild: esbuildJsx,
  test: {
    globals: true,
    // Matcher Prisma-only en Node: evitar jsdom+cadena whatwg-url/undici en Node 22.
    projects: [
      {
        extends: true,
        test: {
          name: "cashflow-matcher",
          environment: "node",
          setupFiles: [],
          include: [
            "src/modules/finance/cashflow/__tests__/draft-occurrence-matcher.test.ts",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "app",
          environment: "jsdom",
          environmentOptions: {
            jsdom: {
              url: "http://localhost/portal/cliente",
            },
          },
          setupFiles: ["./src/test-setup.ts"],
          include: ["src/**/*.{test,spec}.{ts,tsx}"],
          exclude: [
            "src/modules/finance/cashflow/__tests__/draft-occurrence-matcher.test.ts",
          ],
        },
      },
    ],
  },
});
