import type { SchemaObject } from "@nestjs/swagger";
import { z } from "zod";
import {
  ApiErrorResponseSchema,
  RegisterRequestSchema,
  RegisterResponseSchema,
} from "@redsocial/contracts";

export type { RegisterRequest, RegisterResponse } from "@redsocial/contracts";

/**
 * Esquemas JSON para documentar OpenAPI a partir de los contratos Zod (RF-13).
 * El cast es seguro: ambos representan JSON Schema draft; difieren solo en
 * la tipificacion estatica de las librerias.
 */
export const registerRequestJsonSchema = z.toJSONSchema(
  RegisterRequestSchema,
) as unknown as SchemaObject;
export const registerResponseJsonSchema = z.toJSONSchema(
  RegisterResponseSchema,
) as unknown as SchemaObject;
export const apiErrorResponseJsonSchema = z.toJSONSchema(
  ApiErrorResponseSchema,
) as unknown as SchemaObject;
