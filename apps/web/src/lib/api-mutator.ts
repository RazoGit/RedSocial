import { ApiErrorResponseSchema } from "@redsocial/contracts";

import { ApiError } from "@/lib/api-client";
import { getAuthSession } from "@/lib/auth-session";

/**
 * Mutator de Orval (T17): todas las funciones generadas pasan por aqui.
 * Reutiliza el manejo de errores del contrato (ApiErrorResponseSchema),
 * envia/acepta cookies same-origin para el refresh httpOnly y adjunta el
 * access token Bearer en memoria cuando hay sesion (spec 007).
 */
export const customFetch = async <T>(url: string, options?: RequestInit): Promise<T> => {
  const session = getAuthSession();
  const headers = new Headers(options?.headers);
  if (session) headers.set("authorization", `Bearer ${session.accessToken}`);
  const response = await fetch(url, {
    ...options,
    headers,
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
