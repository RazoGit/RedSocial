import type { ZodType } from "zod";

import { ApiErrorResponseSchema } from "@redsocial/contracts";

import { getAuthSession } from "@/lib/auth-session";

/**
 * Cliente del API para el navegador. En dev las peticiones van por el
 * rewrite de Next (/api/v1 -> API), asi que todo es same-origin y la
 * cookie httpOnly del refresh se envia sin configurar CORS.
 */

const API_BASE = "/api/v1";

/**
 * Token Bearer en memoria (una sola instancia por pestana, ver auth-session).
 * Si hay sesion, se adjunta a cada peticion para los endpoints protegidos.
 */
function authHeaders(): Record<string, string> {
  const session = getAuthSession();
  return session ? { authorization: `Bearer ${session.accessToken}` } : {};
}

export class ApiError extends Error {
  constructor(
    /** 0 = fallo de red/servidor inalcanzable; si no, el statusCode HTTP. */
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const NETWORK_MESSAGE = "No se pudo conectar con el servidor. Intenta de nuevo.";

async function parseOk<TResponse>(
  response: Response,
  responseSchema: ZodType<TResponse>,
): Promise<TResponse> {
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

  const result = responseSchema.safeParse(json);
  if (!result.success) {
    throw new ApiError(response.status, "Respuesta invalida del servidor.");
  }
  return result.data;
}

async function request(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${API_BASE}${path}`, {
      credentials: "same-origin",
      cache: "no-store",
      ...init,
      headers: { ...authHeaders(), ...(init.headers as Record<string, string> | undefined) },
    });
  } catch {
    throw new ApiError(0, NETWORK_MESSAGE);
  }
}

export async function getJson<TResponse>(
  path: string,
  responseSchema: ZodType<TResponse>,
): Promise<TResponse> {
  return parseOk(await request(path, { method: "GET" }), responseSchema);
}

export async function postJson<TResponse>(
  path: string,
  body: unknown,
  responseSchema: ZodType<TResponse>,
): Promise<TResponse> {
  return parseOk(
    await request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    responseSchema,
  );
}

export async function patchJson<TResponse>(
  path: string,
  body: unknown,
  responseSchema: ZodType<TResponse>,
): Promise<TResponse> {
  return parseOk(
    await request(path, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    responseSchema,
  );
}

/**
 * Sube binarios a una URL prefirmada (MinIO/S3), FUERA de /api/v1:
 * la firma cubre metodo y cabeceras exactas, asi que no se envia nada extra.
 */
export async function putBinary(url: string, body: Blob, contentType: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "PUT",
      headers: { "content-type": contentType },
      body,
    });
  } catch {
    throw new ApiError(0, NETWORK_MESSAGE);
  }
  if (!response.ok) {
    throw new ApiError(response.status, `Error ${response.status}`);
  }
}

export async function deleteJson<TResponse>(
  path: string,
  responseSchema: ZodType<TResponse>,
): Promise<TResponse> {
  return parseOk(await request(path, { method: "DELETE" }), responseSchema);
}
