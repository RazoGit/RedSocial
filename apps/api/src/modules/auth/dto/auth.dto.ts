import type { SchemaObject } from "@nestjs/swagger";
import { z } from "zod";
import {
  AcceptedResponseSchema,
  ApiErrorResponseSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  RefreshResponseSchema,
  RegisterRequestSchema,
  RegisterResponseSchema,
  ResendVerificationRequestSchema,
  VerifyEmailRequestSchema,
  VerifyEmailResponseSchema,
} from "@redsocial/contracts";

export type {
  AcceptedResponse,
  ApiErrorResponse,
  LoginRequest,
  LoginResponse,
  RefreshResponse,
  RegisterRequest,
  RegisterResponse,
  ResendVerificationRequest,
  VerifyEmailRequest,
  VerifyEmailResponse,
} from "@redsocial/contracts";

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
export const verifyEmailRequestJsonSchema = z.toJSONSchema(
  VerifyEmailRequestSchema,
) as unknown as SchemaObject;
export const verifyEmailResponseJsonSchema = z.toJSONSchema(
  VerifyEmailResponseSchema,
) as unknown as SchemaObject;
export const loginRequestJsonSchema = z.toJSONSchema(LoginRequestSchema) as unknown as SchemaObject;
export const loginResponseJsonSchema = z.toJSONSchema(
  LoginResponseSchema,
) as unknown as SchemaObject;
export const refreshResponseJsonSchema = z.toJSONSchema(
  RefreshResponseSchema,
) as unknown as SchemaObject;
export const resendVerificationRequestJsonSchema = z.toJSONSchema(
  ResendVerificationRequestSchema,
) as unknown as SchemaObject;
export const acceptedResponseJsonSchema = z.toJSONSchema(
  AcceptedResponseSchema,
) as unknown as SchemaObject;
export const apiErrorResponseJsonSchema = z.toJSONSchema(
  ApiErrorResponseSchema,
) as unknown as SchemaObject;
