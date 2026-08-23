import { z } from "zod";

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  uptime: z.number(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const ReadinessCheckSchema = z.enum(["up", "down"]);

export const ReadinessResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  checks: z.record(z.string(), ReadinessCheckSchema),
});

export type ReadinessResponse = z.infer<typeof ReadinessResponseSchema>;

export const ApiErrorResponseSchema = z.object({
  statusCode: z.number(),
  message: z.string(),
  error: z.string().optional(),
  path: z.string(),
  timestamp: z.string(),
});

export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

export const PasswordSchema = z
  .string()
  .min(10, "La contrasena debe tener al menos 10 caracteres")
  .max(128, "La contrasena no puede exceder 128 caracteres");

export const RegisterRequestSchema = z
  .object({
    email: z.email({ message: "Email invalido" }).max(254),
    password: PasswordSchema,
  })
  .strict();

export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const RegisterResponseSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  emailVerified: z.boolean(),
});

export type RegisterResponse = z.infer<typeof RegisterResponseSchema>;

export const VerifyEmailRequestSchema = z
  .object({
    token: z.string().min(32).max(128),
  })
  .strict();

export type VerifyEmailRequest = z.infer<typeof VerifyEmailRequestSchema>;

/**
 * Respuesta comun de los endpoints que inician o renuevan sesion:
 * access token corto en cuerpo (D5) + csrfToken para el double-submit
 * de las proximas mutaciones autenticadas por cookie (D6).
 */
export const AuthSessionResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number().int().positive(),
  csrfToken: z.string().min(32).max(128),
});

export type AuthSessionResponse = z.infer<typeof AuthSessionResponseSchema>;

export const VerifyEmailResponseSchema = AuthSessionResponseSchema;

export type VerifyEmailResponse = z.infer<typeof VerifyEmailResponseSchema>;

export const LoginRequestSchema = z
  .object({
    email: z.email({ message: "Email invalido" }).max(254),
    password: z.string().min(1, "La contrasena es obligatoria").max(128),
  })
  .strict();

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const LoginResponseSchema = AuthSessionResponseSchema;

export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const RefreshResponseSchema = AuthSessionResponseSchema;

export type RefreshResponse = z.infer<typeof RefreshResponseSchema>;

export const ResendVerificationRequestSchema = z
  .object({
    email: z.email({ message: "Email invalido" }).max(254),
  })
  .strict();

export type ResendVerificationRequest = z.infer<typeof ResendVerificationRequestSchema>;

/** Respuesta generica 202 para endpoints que no revelan estado (anti-enumeracion). */
export const AcceptedResponseSchema = z.object({
  accepted: z.literal(true),
});

export type AcceptedResponse = z.infer<typeof AcceptedResponseSchema>;
