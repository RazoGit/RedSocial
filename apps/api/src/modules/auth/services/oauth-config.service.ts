import { BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";

/** Proveedores OAuth soportados por la spec 001 (Bloque D). */
export type OAuthProviderId = "google" | "github";

export function isOAuthProviderId(value: string): value is OAuthProviderId {
  return value === "google" || value === "github";
}

export interface OAuthProviderMeta {
  id: OAuthProviderId;
  /** Endpoint de autorizacion del proveedor (authorization code flow). */
  authorizeUrl: string;
  scope: string;
  /**
   * OIDC: el flujo incluye nonce ligado al id_token que el callback (T12)
   * validara contra el JWKS del proveedor. GitHub usa su API de perfil.
   */
  oidc: boolean;
}

const PROVIDERS: Record<OAuthProviderId, OAuthProviderMeta> = {
  google: {
    id: "google",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    scope: "openid email profile",
    oidc: true,
  },
  github: {
    id: "github",
    authorizeUrl: "https://github.com/login/oauth/authorize",
    scope: "read:user user:email",
    oidc: false,
  },
};

export interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
}

/**
 * Configuracion OAuth por entorno (D1: cliente a mano, sin Passport):
 * metadatos fijos de cada proveedor + credenciales leidas de variables de
 * entorno GOOGLE_* / GITHUB_*.
 */
@Injectable()
export class OauthConfigService {
  meta(provider: OAuthProviderId): OAuthProviderMeta {
    const found = PROVIDERS[provider];
    if (!found) {
      throw new BadRequestException("proveedor_no_soportado");
    }
    return found;
  }

  /** Lanza 503 si faltan credenciales: el flujo no esta disponible aqui. */
  credentials(provider: OAuthProviderId): OAuthCredentials {
    const prefix = provider.toUpperCase();
    const clientId = process.env[`${prefix}_CLIENT_ID`];
    const clientSecret = process.env[`${prefix}_CLIENT_SECRET`];
    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableException(
        `Proveedor OAuth ${provider} no configurado en este entorno`,
      );
    }
    return { clientId, clientSecret };
  }

  /** Base publica de la API para construir redirect_uri de OAuth. */
  apiBaseUrl(): string {
    return process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
  }

  /** Destino del redirect exitoso del callback: pagina del frontend (T13). */
  frontendCallbackUrl(): string {
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    return `${appUrl}/auth/callback`;
  }
}
