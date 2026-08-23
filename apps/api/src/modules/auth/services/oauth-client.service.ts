import { Injectable } from "@nestjs/common";

import type { OAuthProviderId } from "./oauth-config.service";
import { OauthConfigService } from "./oauth-config.service";

export interface AuthorizeUrlParams {
  redirectUri: string;
  state: string;
  nonce?: string;
}

/**
 * Construye la URL de autorizacion del authorization code flow (D1).
 * El canje code->tokens y la verificacion del id_token llegan con T12.
 */
@Injectable()
export class OauthClientService {
  constructor(private readonly config: OauthConfigService) {}

  buildAuthorizeUrl(provider: OAuthProviderId, params: AuthorizeUrlParams): string {
    const meta = this.config.meta(provider);
    const { clientId } = this.config.credentials(provider);

    const url = new URL(meta.authorizeUrl);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", params.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", meta.scope);
    url.searchParams.set("state", params.state);
    if (meta.oidc && params.nonce) {
      url.searchParams.set("nonce", params.nonce);
    }
    return url.toString();
  }
}
