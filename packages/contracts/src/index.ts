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
