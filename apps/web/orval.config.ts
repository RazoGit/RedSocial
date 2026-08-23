import { defineConfig } from "orval";

/**
 * Genera el cliente HTTP del frontend a partir del contrato OpenAPI
 * exportado por la API (pnpm --filter @redsocial/api openapi:export).
 * El cliente usa fetch nativo con rutas relativas: viajan por el rewrite
 * same-origin de Next (/api/v1 -> API), igual que el resto del front.
 */
export default defineConfig({
  api: {
    input: "../../packages/contracts/openapi.json",
    output: {
      target: "./src/lib/generated/api.ts",
      client: "fetch",
      mode: "single",
      clean: true,
      override: {
        query: { useQuery: false, useSuspenseQuery: false },
        mutator: {
          path: "./src/lib/api-mutator.ts",
          name: "customFetch",
        },
      },
    },
  },
});
