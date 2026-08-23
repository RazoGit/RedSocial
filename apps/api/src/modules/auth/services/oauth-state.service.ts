import { Injectable, Optional, UnauthorizedException } from "@nestjs/common";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes } from "node:crypto";
import type { FastifyReply } from "fastify";

import type { OAuthProviderId } from "./oauth-config.service";
import { OauthConfigService } from "./oauth-config.service";

export const OAUTH_STATE_COOKIE_NAME = "oauth_st";
const OAUTH_STATE_TTL_S = 600;

export interface IssuedOAuthState {
  /** Valor firmado para la cookie temporal. */
  cookieValue: string;
  state: string;
  nonce?: string;
}

/**
 * Handshake CSRF de OAuth (plan §flujo): el par state+nonce se firma como JWT
 * de corta vida (10 min) y viaja en una cookie httpOnly acotada a
 * /api/v1/auth/oauth. El callback (T12) compara el ?state recibido contra la
 * cookie antes de canjear el code.
 */
@Injectable()
export class OauthStateService {
  private readonly secretKey: Uint8Array;
  private readonly ttlSeconds: number;

  constructor(
    private readonly config: OauthConfigService,
    @Optional() ttlSeconds?: number,
  ) {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 16) {
      throw new Error("JWT_SECRET no esta definido o es demasiado corto (minimo 16 caracteres)");
    }
    this.secretKey = new TextEncoder().encode(secret);
    this.ttlSeconds = ttlSeconds ?? OAUTH_STATE_TTL_S;
  }

  async issue(provider: OAuthProviderId): Promise<IssuedOAuthState> {
    const meta = this.config.meta(provider);

    const state = randomBytes(32).toString("base64url");
    const nonce = meta.oidc ? randomBytes(32).toString("base64url") : undefined;

    const cookieValue = await new SignJWT({
      provider,
      ...(nonce !== undefined && { nonce }),
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(state)
      .setIssuedAt()
      .setIssuer("redsocial-api")
      .setAudience("redsocial-oauth")
      .setExpirationTime(`${this.ttlSeconds}s`)
      .sign(this.secretKey);

    return { cookieValue, state, nonce };
  }

  /**
   * Verifica la cookie contra el state del query del callback. Devuelve el
   * nonce para validarlo luego contra el id_token (Google).
   */
  async verify(
    rawCookieValue: string | undefined,
    provider: OAuthProviderId,
    queryState: string | undefined,
  ): Promise<{ nonce?: string }> {
    if (!rawCookieValue || !queryState) {
      throw new UnauthorizedException("oauth_state_invalido");
    }
    try {
      const { payload } = await jwtVerify(rawCookieValue, this.secretKey, {
        algorithms: ["HS256"],
        issuer: "redsocial-api",
        audience: "redsocial-oauth",
      });
      if (payload.sub !== queryState || payload.provider !== provider) {
        throw new UnauthorizedException("oauth_state_invalido");
      }
      return typeof payload.nonce === "string" ? { nonce: payload.nonce } : {};
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException("oauth_state_invalido");
    }
  }

  set(reply: FastifyReply, cookieValue: string): void {
    reply.setCookie(OAUTH_STATE_COOKIE_NAME, cookieValue, {
      httpOnly: true,
      path: "/api/v1/auth/oauth",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: this.ttlSeconds,
    });
  }

  clear(reply: FastifyReply): void {
    reply.clearCookie(OAUTH_STATE_COOKIE_NAME, { path: "/api/v1/auth/oauth" });
  }
}
