import "reflect-metadata";

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { VersioningType } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import fastifyCookie from "@fastify/cookie";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { AppModule } from "../src/app.module";

/**
 * Exporta el contrato OpenAPI de la API a un JSON versionado en el repo
 * (packages/contracts/openapi.json). Es la fuente de verdad para generar
 * el cliente del frontend con Orval (T17).
 */
async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, new FastifyAdapter(), {
    logger: false,
  });
  await app.register(fastifyCookie);
  app.setGlobalPrefix("api");
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
  await app.init();

  const config = new DocumentBuilder()
    .setTitle("RedSocial API")
    .setDescription("API REST de la red social (contrato v0)")
    .setVersion("0.1.0")
    .build();
  const document = SwaggerModule.createDocument(app, config);

  // z.toJSONSchema() emite rasgos de draft 2020-12 que OpenAPI 3.0 no
  // soporta ($schema en sub-esquemas, const en literales); se normalizan
  // para que el contrato sea consumible por cualquier herramienta.
  const normalizeToJsonSchemaDialect = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(normalizeToJsonSchemaDialect);
      return;
    }
    if (node && typeof node === "object") {
      const record = node as Record<string, unknown>;
      delete record.$schema;
      if ("const" in record) {
        record.enum = [record.const];
        delete record.const;
      }
      // Draft >=6 permite minimos/maximos exclusivos numericos; OpenAPI 3.0
      // exige la forma booleana con minimum/maximum.
      for (const key of ["exclusiveMinimum", "exclusiveMaximum"] as const) {
        const value = record[key];
        if (typeof value === "number") {
          record[key.replace("exclusive", "").toLowerCase()] = value;
          record[key] = true;
        }
      }
      Object.values(record).forEach(normalizeToJsonSchemaDialect);
    }
  };
  normalizeToJsonSchemaDialect(document.paths);

  const target = resolve(__dirname, "../../../packages/contracts/openapi.json");
  writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`, "utf8");

  await app.close();
  process.stdout.write(`OpenAPI exportado a ${target}\n`);
  // Las conexiones de BullMQ/Prisma mantienen el loop vivo: salir a proposito.
  process.exit(0);
}

void main();
