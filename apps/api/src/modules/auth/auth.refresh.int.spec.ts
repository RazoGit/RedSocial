import { VersioningType } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import fastifyCookie from "@fastify/cookie";
import { createHash, randomBytes } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { ApiErrorResponseSchema, RefreshResponseSchema } from "@redsocial/contracts";

import { AppModule } from "../../app.module";
import { EmailService } from "../email/email.service";
import { PrismaService } from "../prisma/prisma.service";
import { TokensService } from "./tokens.service";
import { CSRF_COOKIE_NAME } from "./services/csrf-cookie.service";
import { LoginRateLimiterService } from "./services/login-rate-limiter.service";
import { REFRESH_COOKIE_NAME } from "./services/refresh-cookie.service";
import { FakePrisma } from "../../testing/fake-prisma";

function sha256(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

interface SessionPair {
  refreshToken: string;
  csrfToken: string;
}

interface RefreshOptions {
  refreshToken?: string;
  csrfCookie?: string;
  csrfHeader?: string;
}

function cookieValue(setCookie: string[], name: string): string | undefined {
  const match = setCookie.find((c) => c.startsWith(`${name}=`));
  return match?.match(new RegExp(`${name}=([^;]+)`))?.[1];
}

describe("POST /auth/refresh (integracion)", () => {
  let app: NestFastifyApplication;
  const prisma = new FakePrisma();
  const limiter = new LoginRateLimiterService(null);

  async function seedLoggedInUser(email: string): Promise<SessionPair> {
    const register = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password: "contrasena-segura" });
    expect(register.status).toBe(201);

    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password: "contrasena-segura" });
    expect(login.status).toBe(200);

    const setCookie = (login.headers["set-cookie"] ?? []) as unknown as string[];
    const refreshToken = cookieValue(setCookie, REFRESH_COOKIE_NAME);
    expect(refreshToken).toBeDefined();
    expect(cookieValue(setCookie, CSRF_COOKIE_NAME)).toBe(login.body.csrfToken);
    return { refreshToken: refreshToken ?? "", csrfToken: login.body.csrfToken };
  }

  async function postRefresh(options: RefreshOptions = {}) {
    const cookies: string[] = [];
    if (options.refreshToken !== undefined) {
      cookies.push(`${REFRESH_COOKIE_NAME}=${options.refreshToken}`);
    }
    if (options.csrfCookie !== undefined) {
      cookies.push(`${CSRF_COOKIE_NAME}=${options.csrfCookie}`);
    }
    const req = request(app.getHttpServer()).post("/api/v1/auth/refresh");
    if (cookies.length > 0) req.set("Cookie", cookies);
    if (options.csrfHeader !== undefined) req.set("X-CSRF-Token", options.csrfHeader);
    return req;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(EmailService)
      .useValue({ enqueueVerificationEmail: vi.fn().mockResolvedValue(undefined) })
      .overrideProvider(LoginRateLimiterService)
      .useValue(limiter)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.register(fastifyCookie);
    app.setGlobalPrefix("api");
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("RF-6/RF-8: rota el refresh; el anterior queda invalido y la nueva sesion es deslizante", async () => {
    const pair = await seedLoggedInUser("rotacion@example.com");
    const userId = prisma.sessions.at(-1)?.userId as string;
    expect(prisma.sessions.filter((s) => s.userId === userId)).toHaveLength(1);

    const res = await postRefresh({
      refreshToken: pair.refreshToken,
      csrfCookie: pair.csrfToken,
      csrfHeader: pair.csrfToken,
    });
    expect(res.status).toBe(200);
    expect(RefreshResponseSchema.safeParse(res.body).success).toBe(true);

    const tokens = app.get(TokensService);
    const payload = await tokens.verifyAccessToken(res.body.accessToken);
    expect(payload.sub).toBe(userId);
    expect(res.body.csrfToken).not.toBe(pair.csrfToken);
    expect(res.body.csrfToken.length).toBeGreaterThanOrEqual(32);

    const setCookie = (res.headers["set-cookie"] ?? []) as unknown as string[];
    const newRt = cookieValue(setCookie, REFRESH_COOKIE_NAME);
    expect(newRt).toBeDefined();
    expect(newRt).not.toBe(pair.refreshToken);
    expect(cookieValue(setCookie, CSRF_COOKIE_NAME)).toBe(res.body.csrfToken);

    const userSessions = prisma.sessions.filter((s) => s.userId === userId);
    expect(userSessions).toHaveLength(2);
    const oldSession = userSessions.find((s) => s.refreshHash === sha256(pair.refreshToken));
    expect(oldSession?.revokedAt).not.toBeNull();
    expect(oldSession?.replacedByHash).not.toBeNull();

    const activeSession = userSessions.find((s) => s.revokedAt === null);
    expect(activeSession?.refreshHash).toBe(sha256(newRt ?? ""));
    const days = (activeSession!.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThanOrEqual(30.01);
  });

  it("Gherkin RF-7: reutilizar el refresh consumido responde 401 y revoca toda la familia", async () => {
    const pair = await seedLoggedInUser("robo@example.com");
    const userId = prisma.sessions.at(-1)?.userId as string;

    const first = await postRefresh({
      refreshToken: pair.refreshToken,
      csrfCookie: pair.csrfToken,
      csrfHeader: pair.csrfToken,
    });
    expect(first.status).toBe(200);
    expect(prisma.sessions.filter((s) => s.userId === userId && s.revokedAt === null)).toHaveLength(
      1,
    );

    const reused = await postRefresh({
      refreshToken: pair.refreshToken,
      csrfCookie: pair.csrfToken,
      csrfHeader: pair.csrfToken,
    });
    expect(reused.status).toBe(401);
    expect(ApiErrorResponseSchema.safeParse(reused.body).success).toBe(true);

    expect(prisma.sessions.filter((s) => s.userId === userId && s.revokedAt === null)).toHaveLength(
      0,
    );

    const newSetCookie = (first.headers["set-cookie"] ?? []) as unknown as string[];
    const rotatedRt = cookieValue(newSetCookie, REFRESH_COOKIE_NAME) ?? "";
    const withRotated = await postRefresh({
      refreshToken: rotatedRt,
      csrfCookie: pair.csrfToken,
      csrfHeader: pair.csrfToken,
    });
    expect(withRotated.status).toBe(401);
  });

  it("D6 double-submit: sin header o con header distinto responde 403 sin consumir el token", async () => {
    const pair = await seedLoggedInUser("csrf@example.com");
    const userId = prisma.sessions.at(-1)?.userId as string;

    const noHeader = await postRefresh({
      refreshToken: pair.refreshToken,
      csrfCookie: pair.csrfToken,
    });
    expect(noHeader.status).toBe(403);
    expect(noHeader.body.message).toBe("csrf_invalid");

    const wrongHeader = await postRefresh({
      refreshToken: pair.refreshToken,
      csrfCookie: pair.csrfToken,
      csrfHeader: `falso-${"0".repeat(32)}`,
    });
    expect(wrongHeader.status).toBe(403);

    expect(prisma.sessions.filter((s) => s.userId === userId)).toHaveLength(1);

    const stillValid = await postRefresh({
      refreshToken: pair.refreshToken,
      csrfCookie: pair.csrfToken,
      csrfHeader: pair.csrfToken,
    });
    expect(stillValid.status).toBe(200);
  });

  it("sin cookie rt responde 401 con la forma del contrato de errores", async () => {
    const csrfDummy = randomBytes(32).toString("base64url");
    const res = await postRefresh({ csrfCookie: csrfDummy, csrfHeader: csrfDummy });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("missing_refresh_cookie");
    expect(ApiErrorResponseSchema.safeParse(res.body).success).toBe(true);
  });

  it("RF-8: un refresh expirado responde 401 y su sesion queda revocada", async () => {
    const rawExpired = randomBytes(32).toString("base64url");
    const user = await prisma.user.create({
      data: { email: "expirado-refresh@example.com", passwordHash: null },
    });
    await prisma.session.create({
      data: {
        userId: user.id,
        refreshHash: sha256(rawExpired),
        userAgent: null,
        ip: null,
        expiresAt: new Date(Date.now() - 1000),
        createdAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
        lastUsedAt: new Date(Date.now() - 1000),
      },
    });

    const csrfDummy = randomBytes(32).toString("base64url");
    const res = await postRefresh({
      refreshToken: rawExpired,
      csrfCookie: csrfDummy,
      csrfHeader: csrfDummy,
    });
    expect(res.status).toBe(401);
    expect(
      prisma.sessions.find((s) => s.refreshHash === sha256(rawExpired))?.revokedAt,
    ).not.toBeNull();
  });
});
