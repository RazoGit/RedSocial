import type { OAuthProviderId } from "../services/oauth-config.service";

/** Identidad que un proveedor reporta tras canjear el code (RF-9). */
export interface ProviderProfile {
  providerAccountId: string;
  email: string;
  emailVerified: boolean;
}

export interface OauthStrategy {
  /**
   * Canjea code por identidad verificada del proveedor. El nonce solo aplica
   * a proveedores OIDC (Google) y debe coincidir con el firmado en la cookie.
   */
  exchangeCode(code: string, redirectUri: string, nonce?: string): Promise<ProviderProfile>;
}

export interface StrategyDeps {
  /** Punto de inyeccion para tests: sustituye fetch global (equivale a mock del proveedor). */
  fetchApi?: typeof fetch;
  /** JWKS alternativo para tests de Google (par de llaves local). */
  jwksUrl?: string;
}

export type OAuthProviderMap = Record<OAuthProviderId, OauthStrategy>;
