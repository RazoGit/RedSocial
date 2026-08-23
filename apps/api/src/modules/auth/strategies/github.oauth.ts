import { BadGatewayException, Injectable, Optional, UnauthorizedException } from "@nestjs/common";

import { OauthConfigService } from "../services/oauth-config.service";
import type { ProviderProfile, StrategyDeps } from "./oauth-strategy.types";
import type { OauthStrategy } from "./oauth-strategy.types";

/**
 * Estrategia GitHub (plan §OAuth): code -> access_token y perfil via API
 * /user + /user/emails. Solo se vincula con el email primario verificado.
 */
@Injectable()
export class GithubOauthStrategy implements OauthStrategy {
  static readonly TOKEN_URL = "https://github.com/login/oauth/access_token";
  static readonly USER_API = "https://api.github.com/user";
  static readonly EMAILS_API = "https://api.github.com/user/emails";

  constructor(
    private readonly config: OauthConfigService,
    @Optional() private readonly deps: StrategyDeps = {},
  ) {}

  async exchangeCode(code: string, redirectUri: string): Promise<ProviderProfile> {
    const { clientId, clientSecret } = this.config.credentials("github");
    const doFetch = this.deps.fetchApi ?? fetch;

    const accessToken = await this.requestAccessToken(doFetch, {
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    });
    if (!accessToken) {
      throw new BadGatewayException("oauth_upstream_error");
    }

    const headers = {
      authorization: `Bearer ${accessToken}`,
      accept: "application/vnd.github+json",
      "user-agent": "redsocial-api",
    };

    const userRes = await doFetch(GithubOauthStrategy.USER_API, { headers }).catch(() => null);
    const user = (await userRes?.json().catch(() => null)) as { id?: number } | null;
    if (!userRes?.ok || typeof user?.id !== "number") {
      throw new BadGatewayException("oauth_upstream_error");
    }

    const emailsRes = await doFetch(GithubOauthStrategy.EMAILS_API, { headers }).catch(() => null);
    const emails = (await emailsRes?.json().catch(() => null)) as Array<{
      email: string;
      primary: boolean;
      verified: boolean;
    }> | null;
    if (!emailsRes?.ok || !Array.isArray(emails)) {
      throw new BadGatewayException("oauth_upstream_error");
    }

    // Plan: solo auto-vincular si el proveedor reporta el email verificado.
    const chosen =
      emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified) ?? null;
    if (!chosen) {
      throw new UnauthorizedException("oauth_email_no_verificado");
    }
    return {
      providerAccountId: String(user.id),
      email: chosen.email.toLowerCase(),
      emailVerified: true,
    };
  }

  private async requestAccessToken(
    doFetch: typeof fetch,
    form: Record<string, string>,
  ): Promise<string | null> {
    let res: Response | null;
    try {
      res = await doFetch(GithubOauthStrategy.TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(form),
      });
    } catch {
      return null;
    }
    const body = (await res.json().catch(() => null)) as { access_token?: string } | null;
    if (!res.ok || !body?.access_token) return null;
    return body.access_token;
  }
}
