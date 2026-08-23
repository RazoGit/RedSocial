import { ApiErrorResponseSchema } from "@redsocial/contracts";

import { ApiError } from "@/lib/api-client";

/**
 * Mutator de Orval (T17): todas las funciones generadas pasan por aqui.
 * Reutiliza el manejo de errores del contrato (ApiErrorResponseSchema) y
 * envia/acepta cookies same-origin para el refresh httpOnly.
 */
export const customFetch = async <T>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
    cache: "no-store",
  });

  const raw = await response.text();
  let json: unknown = null;
  if (raw) {
    try {
      json = JSON.parse(raw) as unknown;
    } catch {
      json = null;
    }
  }

  if (!response.ok) {
    const parsed = ApiErrorResponseSchema.safeParse(json);
    throw new ApiError(
      response.status,
      parsed.success ? parsed.data.message : `Error ${response.status}`,
    );
  }

  return json as T;
};
