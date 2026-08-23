import { BadGatewayException, Injectable, Optional, UnauthorizedException } from "@nestjs/common";
import { createRemoteJWKSet, jwtVerify } from "jose";

import { OauthConfigService } from "../services/oauth-config.service";
import type { ProviderProfile, StrategyDeps } from "./oauth-strategy.types";
import type { OauthStrategy } from "./oauth-strategy.types";

/**
 * Estrategia OIDC de Google (plan §OAuth): code -> id_token verificado contra
 * el JWKS remoto. Solo se acepta si el email viene con email_verified=true.
 */
@Injectable()
export class GoogleOauthStrategy implements OauthStrategy {
  static readonly TOKEN_URL = "https://oauth2.googleapis.com/token";
  static readonly JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
  private static readonly ISSUER = "https://accounts.google.com";

  constructor(
    private readonly config: OauthConfigService,
    @Optional() private readonly deps: StrategyDeps = {},
  ) {}

  async exchangeCode(code: string, redirectUri: string, nonce?: string): Promise<ProviderProfile> {
    const { clientId, clientSecret } = this.config.credentials("google");
    const doFetch = this.deps.fetchApi ?? fetch;

    let res: Response;
    try {
      res = await doFetch(GoogleOauthStrategy.TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });
    } catch {
      throw new BadGatewayException("oauth_upstream_error");
    }
    const body = (await res.json().catch(() => null)) as { id_token?: string } | null;
    if (!res.ok || !body?.id_token) {
      throw new BadGatewayException("oauth_upstream_error");
    }
    return this.verifyIdToken(body.id_token, nonce);
  }

  async verifyIdToken(idToken: string, nonce?: string): Promise<ProviderProfile> {
    const jwks = createRemoteJWKSet(new URL(this.deps.jwksUrl ?? GoogleOauthStrategy.JWKS_URL));
    const { clientId } = this.config.credentials("google");

    let payload;
    try {
      ({ payload } = await jwtVerify(idToken, jwks, {
        algorithms: ["RS256"],
        issuer: GoogleOauthStrategy.ISSUER,
        audience: clientId,
        clockTolerance: "30s",
      }));
    } catch {
      throw new UnauthorizedException("oauth_idtoken_invalido");
    }

    if (nonce !== undefined && payload.nonce !== nonce) {
      throw new UnauthorizedException("oauth_nonce_invalido");
    }
    if (typeof payload.email !== "string" || payload.email_verified !== true) {
      throw new UnauthorizedException("oauth_email_no_verificado");
    }
    return {
      providerAccountId: String(payload.sub),
      email: payload.email,
      emailVerified: true,
    };
  }
}
