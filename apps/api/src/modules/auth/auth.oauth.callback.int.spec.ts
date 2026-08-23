import { UnauthorizedException, VersioningType } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import fastifyCookie from "@fastify/cookie";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProviderProfile } from "./strategies/oauth-strategy.types";
import { AppModule } from "../../app.module";
import { EmailService } from "../email/email.service";
import { PrismaService } from "../prisma/prisma.service";
import { TokensService } from "./tokens.service";
import { GithubOauthStrategy } from "./strategies/github.oauth";
import { GoogleOauthStrategy } from "./strategies/google.oauth";
import { FakePrisma } from "../../testing/fake-prisma";

const PASSWORD = "contrasena-segura";

describe("GET /auth/oauth/:provider/callback (integracion)", () => {
  let app: NestFastifyApplication;
  const prisma = new FakePrisma();
  const enqueueVerificationEmail = vi.fn().mockResolvedValue(undefined);

  // Mocks estables: se reprograman por test sin reconstruir el modulo.
  const googleExchange = vi.fn<() => Promise<ProviderProfile>>();
  const githubExchange = vi.fn<() => Promise<ProviderProfile>>();

  async function start(
    provider: string,
  ): Promise<{ state: string; cookie: string; nonce: string | null }> {
    const res = await request(app.getHttpServer()).get(`/api/v1/auth/oauth/${provider}`);
    expect(res.status).toBe(302);
    const location = new URL(res.headers.location as string);
    const setCookie = (res.headers["set-cookie"] ?? []) as unknown as string[];
    const raw = setCookie.find((c) => c.startsWith("oauth_st="));
    if (!raw) throw new Error("start no emitio cookie oauth_st");
    return {
      state: location.searchParams.get("state") ?? "",
      nonce: location.searchParams.get("nonce"),
      cookie: `oauth_st=${raw.split(";")[0]?.slice("oauth_st=".length)}`,
    };
  }

  function setCookieNames(res: { headers: Record<string, unknown> }): Map<string, boolean> {
    const map = new Map<string, boolean>();
    for (const c of ((res.headers["set-cookie"] ?? []) as unknown as string[]) ?? []) {
      map.set(c.split("=")[0] ?? "", true);
    }
    return map;
  }

  beforeAll(async () => {
    process.env.GOOGLE_CLIENT_ID = "test-google-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-google-secret";
    process.env.GITHUB_CLIENT_ID = "test-github-id";
    process.env.GITHUB_CLIENT_SECRET = "test-github-secret";
    process.env.API_URL = "https://api.local";
    process.env.APP_URL = "https://web.local";

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(EmailService)
      .useValue({ enqueueVerificationEmail })
      .overrideProvider(GoogleOauthStrategy)
      .useValue({ exchangeCode: googleExchange })
      .overrideProvider(GithubOauthStrategy)
      .useValue({ exchangeCode: githubExchange })
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.register(fastifyCookie);
    app.setGlobalPrefix("api");
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    for (const key of [
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "GITHUB_CLIENT_ID",
      "GITHUB_CLIENT_SECRET",
      "API_URL",
      "APP_URL",
    ]) {
      delete process.env[key];
    }
    await app.close();
  });

  describe("flujo google", () => {
    beforeEach(() => {
      googleExchange.mockReset().mockResolvedValue({
        providerAccountId: "g-1",
        email: "gina@gmail.com",
        emailVerified: true,
      });
    });

    it("RF-9 primer ingreso: crea usuario verificado, emite sesion y redirige al frontend", async () => {
      const start1 = await start("google");

      const res = await request(app.getHttpServer())
        .get(
          `/api/v1/auth/oauth/google/callback?code=abc&state=${encodeURIComponent(start1.state)}`,
        )
        .set("Cookie", start1.cookie);

      expect(res.status).toBe(302);
      const location = String(res.headers.location);
      if (!location.startsWith("https://web.local/auth/callback#")) {
        throw new Error(`location inesperada: ${location}`);
      }
      const fragment = new URLSearchParams(location.split("#")[1] ?? "");
      expect(fragment.get("expires_in")).toBe("900");
      const access = fragment.get("access") ?? "";
      const csrf = fragment.get("csrf") ?? "";
      expect(access.length).toBeGreaterThan(20);
      expect(csrf.length).toBeGreaterThanOrEqual(32);

      // El handshake completo llego a la estrategia con el nonce de la cookie.
      expect(googleExchange).toHaveBeenCalledWith(
        "abc",
        "https://api.local/api/v1/auth/oauth/google/callback",
        start1.nonce,
      );

      // RF-6: cookies rt httpOnly + csrf_token legible.
      const setCookieRaw = ((res.headers["set-cookie"] ?? []) as unknown as string[]) ?? [];
      expect(setCookieRaw.find((c) => c.startsWith("rt="))).toContain("HttpOnly");
      const csrfCookie = setCookieRaw.find((c) => c.startsWith("csrf_token="));
      expect(csrfCookie?.match(/csrf_token=([^;]+)/)?.[1]).toBe(csrf);

      // Usuario creado verificado sin password + oauth_account + sesion.
      const user = prisma.users.find((u) => u.email === "gina@gmail.com");
      expect(user).toBeDefined();
      expect(user?.emailVerified).toBe(true);
      expect(user?.passwordHash).toBeNull();
      expect(prisma.oauthAccounts).toEqual([
        expect.objectContaining({
          userId: user?.id,
          provider: "google",
          providerAccountId: "g-1",
        }),
      ]);
      expect(prisma.sessions).toHaveLength(1);

      const payload = await app.get(TokensService).verifyAccessToken(access);
      expect(payload.sub).toBe(user?.id);
      expect(payload.email).toBe("gina@gmail.com");
    });

    it("segundo ingreso reutiliza la cuenta sin duplicar vinculos ni usuarios", async () => {
      const start2 = await start("google");
      const res = await request(app.getHttpServer())
        .get(
          `/api/v1/auth/oauth/google/callback?code=def&state=${encodeURIComponent(start2.state)}`,
        )
        .set("Cookie", start2.cookie);

      expect(res.status).toBe(302);
      expect(prisma.users.filter((u) => u.email === "gina@gmail.com")).toHaveLength(1);
      expect(prisma.oauthAccounts.filter((a) => a.provider === "google")).toHaveLength(1);
      expect(prisma.sessions).toHaveLength(2);
    });

    it("RF-9 vinculacion: email verificado del proveedor se vincula a la cuenta local existente", async () => {
      const register = await request(app.getHttpServer())
        .post("/api/v1/auth/register")
        .send({ email: "hugo@example.com", password: PASSWORD });
      expect(register.status).toBe(201);
      const localUser = prisma.users.find((u) => u.email === "hugo@example.com");
      expect(localUser).toBeDefined();

      googleExchange.mockResolvedValue({
        providerAccountId: "g-2",
        email: "hugo@example.com",
        emailVerified: true,
      });

      const start3 = await start("google");
      const res = await request(app.getHttpServer())
        .get(
          `/api/v1/auth/oauth/google/callback?code=ghi&state=${encodeURIComponent(start3.state)}`,
        )
        .set("Cookie", start3.cookie);

      expect(res.status).toBe(302);
      expect(prisma.users.filter((u) => u.email === "hugo@example.com")).toHaveLength(1);
      expect(prisma.oauthAccounts).toContainEqual(
        expect.objectContaining({
          userId: localUser?.id,
          provider: "google",
          providerAccountId: "g-2",
        }),
      );
      // La cuenta local conserva su estado de verificacion propio.
      expect(localUser?.emailVerified).toBe(false);

      const fragment = new URLSearchParams(String(res.headers.location).split("#")[1] ?? "");
      const payload = await app.get(TokensService).verifyAccessToken(fragment.get("access") ?? "");
      expect(payload.sub).toBe(localUser?.id);
    });

    it("email sin verificar en el proveedor: 401 guiado, sin crear usuario ni sesion", async () => {
      const usersBefore = prisma.users.length;
      const sessionsBefore = prisma.sessions.length;

      googleExchange.mockRejectedValue(new UnauthorizedException("oauth_email_no_verificado"));

      const start4 = await start("google");
      const res = await request(app.getHttpServer())
        .get(
          `/api/v1/auth/oauth/google/callback?code=jkl&state=${encodeURIComponent(start4.state)}`,
        )
        .set("Cookie", start4.cookie);

      expect(res.status).toBe(401);
      expect(res.body.message).toBe("oauth_email_no_verificado");
      expect(prisma.users).toHaveLength(usersBefore);
      expect(prisma.sessions).toHaveLength(sessionsBefore);
      // La cookie de state se consume incluso ante fallos.
      expect(setCookieNames(res).has("oauth_st")).toBe(true);
    });

    it("state ausente o alterado responde 401 oauth_state_invalido", async () => {
      const noCookie = await request(app.getHttpServer()).get(
        "/api/v1/auth/oauth/google/callback?code=a&state=x",
      );
      expect(noCookie.status).toBe(401);
      expect(noCookie.body.message).toBe("oauth_state_invalido");

      const start5 = await start("google");
      const altered = await request(app.getHttpServer())
        .get("/api/v1/auth/oauth/google/callback?code=a&state=manipulado")
        .set("Cookie", start5.cookie);
      expect(altered.status).toBe(401);
      expect(altered.body.message).toBe("oauth_state_invalido");
    });

    it("code ausente con handshake valido responde 400", async () => {
      const start6 = await start("github");
      const res = await request(app.getHttpServer())
        .get(`/api/v1/auth/oauth/github/callback?state=${encodeURIComponent(start6.state)}`)
        .set("Cookie", start6.cookie);
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("oauth_code_ausente");
    });
  });

  describe("flujo github", () => {
    beforeEach(() => {
      githubExchange.mockReset().mockResolvedValue({
        providerAccountId: "gh-9",
        email: "irene@github.com",
        emailVerified: true,
      });
    });

    it("primer ingreso github crea usuario con vinculo provider=github", async () => {
      const s = await start("github");
      const res = await request(app.getHttpServer())
        .get(`/api/v1/auth/oauth/github/callback?code=zzz&state=${encodeURIComponent(s.state)}`)
        .set("Cookie", s.cookie);

      expect(res.status).toBe(302);
      expect(githubExchange).toHaveBeenCalledWith(
        "zzz",
        "https://api.local/api/v1/auth/oauth/github/callback",
        undefined,
      );
      const user = prisma.users.find((u) => u.email === "irene@github.com");
      expect(user).toBeDefined();
      expect(prisma.oauthAccounts).toContainEqual(
        expect.objectContaining({ userId: user?.id, provider: "github" }),
      );
    });
  });
});
