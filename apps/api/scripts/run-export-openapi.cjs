/**
 * Lanza export-openapi.ts forzando CommonJS: el tsconfig principal usa
 * module ES2022 y, bajo Node >= 20 con auto-deteccion ESM, los imports sin
 * extension de `../src/**` fallan con ERR_MODULE_NOT_FOUND. Este wrapper
 * sobreescribe los compilerOptions antes de cargar ts-node (CI + local).
 */
process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: "CommonJS",
  moduleResolution: "Node",
  esModuleInterop: true,
  experimentalDecorators: true,
  emitDecoratorMetadata: true,
});

/* eslint-disable @typescript-eslint/no-require-imports */
require("ts-node/register/transpile-only");
require("./export-openapi");
