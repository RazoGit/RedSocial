import { BadGatewayException, UnauthorizedException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OauthConfigService } from "../services/oauth-config.service";
import { GithubOauthStrategy } from "./github.oauth";

describe("GithubOauthStrategy", () => {
  const apiResponses = new Map<string, { status: number; body: unknown }>();
  const apiCalls: Array<{ url: string; init?: RequestInit }> = [];

  function installFetch(): void {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> => {
        const url = String(input);
        apiCalls.push({ url, init });
        const res = apiResponses.get(url);
        if (!res) return new Response("url inesperada", { status: 404 });
        return new Response(JSON.stringify(res.body), { status: res.status });
      }),
    );
  }

  beforeEach(() => {
    process.env.GITHUB_CLIENT_ID = "gh-id";
    process.env.GITHUB_CLIENT_SECRET = "gh-secret";
    installFetch();
  });

  afterEach(() => {
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
    vi.unstubAllGlobals();
    apiCalls.length = 0;
    apiResponses.clear();
  });

  function mockHappyPath(
    emails: Array<{ email: string; primary: boolean; verified: boolean }>,
  ): void {
    apiResponses.set(GithubOauthStrategy.TOKEN_URL, {
      status: 200,
      body: { access_token: "gho-token" },
    });
    apiResponses.set(GithubOauthStrategy.USER_API, { status: 200, body: { id: 424242 } });
    apiResponses.set(GithubOauthStrategy.EMAILS_API, { status: 200, body: emails });
  }

  it("usa el email primario verificado y consulta la API con Bearer", async () => {
    mockHappyPath([
      { email: "otro@github.com", primary: false, verified: true },
      { email: "Principal@GitHub.com", primary: true, verified: true },
    ]);
    const strategy = new GithubOauthStrategy(new OauthConfigService());

    const profile = await strategy.exchangeCode("codigo", "https://api.local/cb");

    expect(profile).toEqual({
      providerAccountId: "424242",
      email: "principal@github.com",
      emailVerified: true,
    });
    const tokenCall = apiCalls.find((c) => c.url === GithubOauthStrategy.TOKEN_URL);
    expect(tokenCall?.init?.method).toBe("POST");
    const userCall = apiCalls.find((c) => c.url === GithubOauthStrategy.USER_API);
    expect(userCall?.init?.headers).toMatchObject({ authorization: "Bearer gho-token" });
  });

  it("acepta un email verificado aunque no sea primario", async () => {
    mockHappyPath([{ email: "solo-verificado@github.com", primary: false, verified: true }]);
    const strategy = new GithubOauthStrategy(new OauthConfigService());

    const profile = await strategy.exchangeCode("codigo", "https://api.local/cb");
    expect(profile.email).toBe("solo-verificado@github.com");
  });

  it("rechaza cuando ningun email esta verificado (vinculacion suplantable)", async () => {
    mockHappyPath([{ email: "no-verificado@github.com", primary: true, verified: false }]);
    const strategy = new GithubOauthStrategy(new OauthConfigService());

    await expect(strategy.exchangeCode("codigo", "https://api.local/cb")).rejects.toThrow(
      new UnauthorizedException("oauth_email_no_verificado"),
    );
  });

  it("mapea fallos del canje o de la API a 502", async () => {
    apiResponses.set(GithubOauthStrategy.TOKEN_URL, { status: 200, body: {} });
    const strategy = new GithubOauthStrategy(new OauthConfigService());
    await expect(strategy.exchangeCode("codigo", "https://api.local/cb")).rejects.toThrow(
      new BadGatewayException("oauth_upstream_error"),
    );

    apiResponses.clear();
    apiResponses.set(GithubOauthStrategy.TOKEN_URL, {
      status: 200,
      body: { access_token: "gho-token" },
    });
    apiResponses.set(GithubOauthStrategy.USER_API, { status: 500, body: {} });
    await expect(strategy.exchangeCode("codigo", "https://api.local/cb")).rejects.toThrow(
      new BadGatewayException("oauth_upstream_error"),
    );
  });
});
