import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { afterEach, describe, expect, it } from "vitest";

import { OauthClientService } from "./oauth-client.service";
import { OauthConfigService, isOAuthProviderId } from "./oauth-config.service";

const client = new OauthClientService(new OauthConfigService());

afterEach(() => {
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.GITHUB_CLIENT_ID;
  delete process.env.GITHUB_CLIENT_SECRET;
});

describe("OauthConfigService", () => {
  it("valida el id de proveedor del path", () => {
    expect(isOAuthProviderId("google")).toBe(true);
    expect(isOAuthProviderId("github")).toBe(true);
    expect(isOAuthProviderId("twitter")).toBe(false);
  });

  it("meta desconocido lanza 400", () => {
    expect(() =>
      client.buildAuthorizeUrl("twitter" as never, {
        redirectUri: "https://api/x",
        state: "s",
      }),
    ).toThrow(BadRequestException);
  });

  it("credenciales ausentes lanza 503", () => {
    expect(() => new OauthConfigService().credentials("google")).toThrow(
      ServiceUnavailableException,
    );
  });

  it("lee las credenciales de las variables GOOGLE_* / GITHUB_*", () => {
    process.env.GOOGLE_CLIENT_ID = "id-google";
    process.env.GOOGLE_CLIENT_SECRET = "sec-google";

    const creds = new OauthConfigService().credentials("google");
    expect(creds).toEqual({ clientId: "id-google", clientSecret: "sec-google" });
  });
});

describe("OauthClientService.buildAuthorizeUrl", () => {
  const params = {
    redirectUri: "https://api.local/api/v1/auth/oauth/google/callback",
    state: "st-123",
  };

  it("google incluye scope OIDC, nonce y redirect_uri codificado", () => {
    process.env.GOOGLE_CLIENT_ID = "id-google";
    process.env.GOOGLE_CLIENT_SECRET = "sec-google";

    const url = new URL(client.buildAuthorizeUrl("google", { ...params, nonce: "nonce-1" }));

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("id-google");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("state")).toBe("st-123");
    expect(url.searchParams.get("nonce")).toBe("nonce-1");
    expect(url.searchParams.get("redirect_uri")).toBe(params.redirectUri);
  });

  it("github usa su endpoint y no lleva nonce", () => {
    process.env.GITHUB_CLIENT_ID = "id-github";
    process.env.GITHUB_CLIENT_SECRET = "sec-github";

    const url = new URL(client.buildAuthorizeUrl("github", params));

    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("id-github");
    expect(url.searchParams.get("scope")).toBe("read:user user:email");
    expect(url.searchParams.has("nonce")).toBe(false);
  });

  it("sin credenciales ni siquiera construye la URL (503)", () => {
    expect(() => client.buildAuthorizeUrl("github", params)).toThrow(ServiceUnavailableException);
  });
});
