import type { SchemaObject } from "@nestjs/swagger";
import { z } from "zod";
import {
  CheckUsernameResponseSchema,
  MeProfileResponseSchema,
  PresignAvatarRequestSchema,
  PresignAvatarResponseSchema,
  UpdateProfileRequestSchema,
  UserProfileResponseSchema,
  MinimalProfileResponseSchema,
  ApiErrorResponseSchema,
} from "@redsocial/contracts";

export type {
  CheckUsernameResponse,
  MeProfileResponse,
  MinimalProfileResponse,
  PresignAvatarRequest,
  PresignAvatarResponse,
  UpdateProfileRequest,
  UserProfileResponse,
  ApiErrorResponse,
} from "@redsocial/contracts";

/**
 * z.toJSONSchema emite nullabilidad como anyOf con type:"null" (JSON Schema
 * 2020-12), pero el documento OpenAPI es 3.0 y exige `nullable: true`.
 * Convierte { anyOf: [T, {type:"null"}] } en { ...T, nullable: true }.
 */
function toOpenApi30(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toOpenApi30);
  if (!node || typeof node !== "object") return node;

  const obj = node as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === "anyOf" && Array.isArray(value)) {
      const nonNull = value.filter((sub) => (sub as { type?: string }).type !== "null");
      if (nonNull.length === value.length - 1 && nonNull.length >= 1) {
        const merged = toOpenApi30(nonNull[0]) as Record<string, unknown>;
        Object.assign(result, merged);
        result.nullable = true;
        continue;
      }
    }
    result[key] = toOpenApi30(value);
  }
  return result;
}

function schemaOf(contract: z.ZodType): SchemaObject {
  return toOpenApi30(z.toJSONSchema(contract)) as SchemaObject;
}

/**
 * Esquemas JSON para OpenAPI a partir de los contratos Zod (patron auth.dto).
 */
export const meProfileResponseJsonSchema = schemaOf(MeProfileResponseSchema);
export const updateProfileRequestJsonSchema = schemaOf(UpdateProfileRequestSchema);
export const checkUsernameResponseJsonSchema = schemaOf(CheckUsernameResponseSchema);
export const userProfileResponseJsonSchema = schemaOf(UserProfileResponseSchema);
export const minimalProfileResponseJsonSchema = schemaOf(MinimalProfileResponseSchema);
export const presignAvatarRequestJsonSchema = schemaOf(PresignAvatarRequestSchema);
export const presignAvatarResponseJsonSchema = schemaOf(PresignAvatarResponseSchema);
export const apiErrorResponseJsonSchema = schemaOf(ApiErrorResponseSchema);
