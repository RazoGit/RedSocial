import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";

export default defineConfig({
  // SWC emite decoratorMetadata, necesario para la inyeccion de dependencias de Nest en tests.
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    env: {
      NODE_ENV: "test",
      JWT_SECRET: "secreto-de-prueba-vitest-0123456789abcdef",
    },
  },
});
