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

/** RF-10: confirmacion de cierre de sesion (individual o global). */
export const LogoutResponseSchema = z.object({
  ok: z.literal(true),
});

export type LogoutResponse = z.infer<typeof LogoutResponseSchema>;

/** Perfil publico del usuario autenticado para el frontend (GET /me). */
export const MeResponseSchema = RegisterResponseSchema;

export type MeResponse = z.infer<typeof MeResponseSchema>;

/** Respuesta generica 202 para endpoints que no revelan estado (anti-enumeracion). */
export const AcceptedResponseSchema = z.object({
  accepted: z.literal(true),
});

export type AcceptedResponse = z.infer<typeof AcceptedResponseSchema>;

/** RF-11: solicitud de recuperacion de contrasena (la respuesta no revela si la cuenta existe). */
export const ForgotPasswordRequestSchema = z
  .object({
    email: z.email({ message: "Email invalido" }).max(254),
  })
  .strict();

export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequestSchema>;

/** RF-12: restablecimiento con token de un solo uso y la nueva contrasena. */
export const ResetPasswordRequestSchema = z
  .object({
    token: z.string().min(32).max(128),
    password: PasswordSchema,
  })
  .strict();

export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;

/** RF-12: confirmacion de restablecimiento; todas las sesiones quedaron revocadas. */
export const ResetPasswordResponseSchema = z.object({
  ok: z.literal(true),
});

export type ResetPasswordResponse = z.infer<typeof ResetPasswordResponseSchema>;

// ---------------------------------------------------------------------------
// Spec 002 — Usuarios y Perfiles
// ---------------------------------------------------------------------------

/** RF-2: formato valido de username (se valida junto a reservados/unicidad). */
export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export const UsernameSchema = z
  .string()
  .regex(USERNAME_PATTERN, "El username debe tener 3-20 caracteres: a-z, 0-9 o _");

export type Username = z.infer<typeof UsernameSchema>;

export const DisplayNameSchema = z
  .string()
  .trim()
  .min(1, "El nombre visible es obligatorio")
  .max(50, "El nombre visible no puede exceder 50 caracteres");

export const BioSchema = z.string().trim().max(280, "La bio no puede exceder 280 caracteres");

/** Razones de indisponibilidad de un username para check-username. */
export const UsernameUnavailableReasonSchema = z.enum(["taken", "reserved", "invalid_format"]);

export type UsernameUnavailableReason = z.infer<typeof UsernameUnavailableReasonSchema>;

export const CheckUsernameResponseSchema = z.object({
  available: z.boolean(),
  reason: UsernameUnavailableReasonSchema.optional(),
});

export type CheckUsernameResponse = z.infer<typeof CheckUsernameResponseSchema>;

/** RF-6: los cambios de perfil quedan auditados con updatedAt. */
export const MeProfileResponseSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  emailVerified: z.boolean(),
  username: z.string(),
  displayName: z.string().nullable(),
  bio: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  avatarBlurhash: z.string().nullable(),
  isPrivate: z.boolean(),
  updatedAt: z.string(),
});

export type MeProfileResponse = z.infer<typeof MeProfileResponseSchema>;

export const UpdateProfileRequestSchema = z
  .object({
    displayName: DisplayNameSchema.nullable().optional(),
    bio: BioSchema.nullable().optional(),
    username: UsernameSchema.optional(),
    isPrivate: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Debes enviar al menos un campo",
  });

export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequestSchema>;

/**
 * Vista publica completa de un perfil (RF-5): el dueno o cualquier visitante
 * cuando el perfil es publico.
 */
export const UserProfileResponseSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  displayName: z.string().nullable(),
  bio: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  avatarBlurhash: z.string().nullable(),
  isPrivate: z.boolean(),
  emailVerified: z.boolean(),
});

export type UserProfileResponse = z.infer<typeof UserProfileResponseSchema>;

/** Vista minima ante terceros cuando el perfil es privado (Gherkin spec §6). */
export const MinimalProfileResponseSchema = z.object({
  username: z.string(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  avatarBlurhash: z.string().nullable(),
});

export type MinimalProfileResponse = z.infer<typeof MinimalProfileResponseSchema>;

/** Tipos de imagen aceptados para el avatar (RF-4). */
export const AVATAR_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Limite de peso del avatar original (RF-4). */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export const PresignAvatarRequestSchema = z
  .object({
    contentType: z.enum(AVATAR_CONTENT_TYPES, {
      message: "Solo se aceptan imagenes JPEG, PNG o WebP",
    }),
    sizeBytes: z
      .number()
      .int()
      .positive({ message: "El tamaño del archivo debe ser positivo" })
      .max(AVATAR_MAX_BYTES, "La imagen no puede superar 2 MB"),
  })
  .strict();

export type PresignAvatarRequest = z.infer<typeof PresignAvatarRequestSchema>;

export const PresignAvatarResponseSchema = z.object({
  uploadUrl: z.url(),
  key: z.string().min(8).max(256),
  expiresIn: z.number().int().positive(),
});

export type PresignAvatarResponse = z.infer<typeof PresignAvatarResponseSchema>;
