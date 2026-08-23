/**
 * Sesion del usuario en la web: el access token vive SOLO en memoria
 * (una variable de modulo), nunca en localStorage/sessionStorage ni
 * cookies legibles por JS. Al recargar la pagina la sesion se pierde y
 * se recupera via refresh (cookie httpOnly rt de la API) o login.
 */

export interface AuthSession {
  accessToken: string;
  /** Token csrf para cabeceras X-CSRF-Token en refresh/logout. */
  csrfToken: string;
  /** Momento (epoch ms) en que expira el access token. */
  expiresAt: number;
}

let session: AuthSession | null = null;

export function setAuthSession(next: AuthSession): void {
  session = next;
}

export function getAuthSession(): AuthSession | null {
  if (!session || Date.now() >= session.expiresAt) return null;
  return session;
}

export function clearAuthSession(): void {
  session = null;
}

export interface CallbackTokens {
  accessToken: string;
  csrfToken: string;
  expiresIn: number;
}

/**
 * Parsea el fragmento `#access=...&expires_in=...&csrf=...` que la API
 * anade al redirect del callback OAuth (el fragmento nunca llega al
 * servidor, por eso es el lugar seguro para el access token).
 */
export function parseCallbackFragment(fragment: string): CallbackTokens | null {
  if (!fragment.startsWith("#")) return null;

  const params = new URLSearchParams(fragment.slice(1));
  const access = params.get("access");
  const csrf = params.get("csrf");
  const expiresRaw = params.get("expires_in");
  if (!access || !csrf || !expiresRaw) return null;

  const expiresIn = Number(expiresRaw);
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) return null;

  return { accessToken: access, csrfToken: csrf, expiresIn };
}
