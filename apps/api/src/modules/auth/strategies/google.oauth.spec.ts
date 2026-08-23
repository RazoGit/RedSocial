import { BadGatewayException, UnauthorizedException } from "@nestjs/common";
import { generateKeyPairSync } from "node:crypto";
import { SignJWT, exportJWK } from "jose";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { OauthConfigService } from "../services/oauth-config.service";
import { GoogleOauthStrategy } from "./google.oauth";

const CLIENT_ID = "google-audience";

describe("GoogleOauthStrategy", () => {
  let jwksBody: string;
  let privateKey: import("node:crypto").KeyObject;
  let tokenResponseBody: { status: number; body: unknown };
  const tokenCalls: Array<{ url: string; init?: RequestInit }> = [];

  beforeAll(async () => {
    // Par RSA propio: el codigo exige RS256 (igual que los id_token de Google).
    const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
    privateKey = pair.privateKey;
    const publicJwk = await exportJWK(pair.publicKey);
    jwksBody = JSON.stringify({
      keys: [{ ...publicJwk, kid: "test-key", alg: "RS256", use: "sig" }],
    });
  });

  function installFetch(): void {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> => {
        const url = String(input);
        if (url === GoogleOauthStrategy.TOKEN_URL) {
          tokenCalls.push({ url, init });
          return new Response(JSON.stringify(tokenResponseBody.body), {
            status: tokenResponseBody.status,
          });
        }
        if (url === GoogleOauthStrategy.JWKS_URL) {
          return new Response(jwksBody, {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response("url inesperada", { status: 404 });
      }),
    );
  }

  async function craftIdToken(
    overrides: {
      aud?: string;
      iss?: string;
      email?: string;
      emailVerified?: boolean;
      nonce?: string;
      exp?: string;
    } = {},
  ): Promise<string> {
    return new SignJWT({
      email: overrides.email ?? "gina@gmail.com",
      email_verified: overrides.emailVerified ?? true,
      ...(overrides.nonce !== undefined && { nonce: overrides.nonce }),
    })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setSubject("sub-google-1")
      .setIssuedAt()
      .setIssuer(overrides.iss ?? "https://accounts.google.com")
      .setAudience(overrides.aud ?? CLIENT_ID)
      .setExpirationTime(overrides.exp ?? "5m")
      .sign(privateKey);
  }

  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
    process.env.GOOGLE_CLIENT_SECRET = "google-secret";
    tokenResponseBody = { status: 200, body: {} };
    installFetch();
  });

  afterEach(() => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    vi.unstubAllGlobals();
    tokenCalls.length = 0;
  });

  it("canjea code, verifica el id_token contra el JWKS y devuelve la identidad verificada", async () => {
    const nonce = "nonce-123";
    tokenResponseBody = { status: 200, body: { id_token: await craftIdToken({ nonce }) } };
    const strategy = new GoogleOauthStrategy(new OauthConfigService());

    const profile = await strategy.exchangeCode("codigo", "https://api.local/cb", nonce);

    expect(profile).toEqual({
      providerAccountId: "sub-google-1",
      email: "gina@gmail.com",
      emailVerified: true,
    });
    expect(tokenCalls).toHaveLength(1);
    const sentBody = new URLSearchParams(String(tokenCalls[0].init?.body));
    expect(sentBody.get("code")).toBe("codigo");
    expect(sentBody.get("client_id")).toBe(CLIENT_ID);
    expect(sentBody.get("grant_type")).toBe("authorization_code");
  });

  it("rechaza si el nonce del id_token no coincide con el firmado en la cookie", async () => {
    tokenResponseBody = {
      status: 200,
      body: { id_token: await craftIdToken({ nonce: "otro-nonce" }) },
    };
    const strategy = new GoogleOauthStrategy(new OauthConfigService());

    await expect(strategy.exchangeCode("c", "r", "nonce-esperado")).rejects.toThrow(
      new UnauthorizedException("oauth_nonce_invalido"),
    );
  });

  it("rechaza id_token con audience o issuer ajenos", async () => {
    tokenResponseBody = {
      status: 200,
      body: { id_token: await craftIdToken({ aud: "otra-app" }) },
    };
    const strategy = new GoogleOauthStrategy(new OauthConfigService());
    await expect(strategy.exchangeCode("c", "r")).rejects.toThrow(UnauthorizedException);

    tokenResponseBody = {
      status: 200,
      body: { id_token: await craftIdToken({ iss: "https://evil.example" }) },
    };
    await expect(strategy.exchangeCode("c", "r")).rejects.toThrow(
      new UnauthorizedException("oauth_idtoken_invalido"),
    );
  });

  it("rechaza emails sin email_verified=true (vinculacion suplantable)", async () => {
    tokenResponseBody = {
      status: 200,
      body: { id_token: await craftIdToken({ emailVerified: false }) },
    };
    const strategy = new GoogleOauthStrategy(new OauthConfigService());

    await expect(strategy.exchangeCode("c", "r")).rejects.toThrow(
      new UnauthorizedException("oauth_email_no_verificado"),
    );
  });

  it("mapea fallos del endpoint de tokens a 502", async () => {
    tokenResponseBody = { status: 500, body: { error: "server_error" } };
    const strategy = new GoogleOauthStrategy(new OauthConfigService());

    await expect(strategy.exchangeCode("c", "r")).rejects.toThrow(
      new BadGatewayException("oauth_upstream_error"),
    );
  });
});
