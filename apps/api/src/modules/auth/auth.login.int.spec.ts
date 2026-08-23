import { VersioningType } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import fastifyCookie from "@fastify/cookie";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { LoginResponseSchema, ApiErrorResponseSchema } from "@redsocial/contracts";

import { AppModule } from "../../app.module";
import { EmailService } from "../email/email.service";
import { PrismaService } from "../prisma/prisma.service";
import { TokensService } from "./tokens.service";
import { LoginRateLimiterService } from "./services/login-rate-limiter.service";
import { FakePrisma } from "../../testing/fake-prisma";

describe("POST /auth/login (integracion)", () => {
  let app: NestFastifyApplication;
  const prisma = new FakePrisma();
  const enqueueVerificationEmail = vi.fn().mockResolvedValue(undefined);
  const limiter = new LoginRateLimiterService(null);

  async function registerUser(email: string): Promise<void> {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password: "contrasena-segura" });
    expect(res.status).toBe(201);
  }

  async function login(email: string, password: string) {
    return request(app.getHttpServer()).post("/api/v1/auth/login").send({ email, password });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(EmailService)
      .useValue({ enqueueVerificationEmail })
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

  beforeEach(async () => {
    await limiter.clear();
  });

  afterAll(async () => {
    await app.close();
  });

  it("RF-4: permite login sin email verificado y emite sesion con cookie rt", async () => {
    await registerUser("beto@example.com");
    expect(prisma.users[0].emailVerified).toBe(false);

    const res = await login("beto@example.com", "contrasena-segura");

    expect(res.status).toBe(200);
    expect(LoginResponseSchema.safeParse(res.body).success).toBe(true);
    expect(res.body.expiresIn).toBe(900);

    const tokens = app.get(TokensService);
    const payload = await tokens.verifyAccessToken(res.body.accessToken);
    expect(payload.sub).toBe(prisma.users[0].id);
    expect(payload.email).toBe("beto@example.com");

    const cookieHeader = (res.headers["set-cookie"] ?? []) as unknown as string[];
    const rtCookie = cookieHeader.find((c) => c.startsWith("rt="));
    expect(rtCookie).toBeDefined();
    expect(rtCookie).toContain("HttpOnly");
    expect(rtCookie).toContain("Path=/api/v1/auth");

    const csrfCookie = cookieHeader.find((c) => c.startsWith("csrf_token="));
    expect(csrfCookie).toBeDefined();
    expect(csrfCookie).not.toContain("HttpOnly");
    expect(csrfCookie?.match(/csrf_token=([^;]+)/)?.[1]).toBe(res.body.csrfToken);

    expect(prisma.sessions).toHaveLength(1);
    expect(prisma.sessions[0].userId).toBe(prisma.users[0].id);
  });

  it("login correcto limpia los fallos previos de la IP (RF-5)", async () => {
    await registerUser("reset@example.com");
    await login("reset@example.com", "mala-uno");
    await login("reset@example.com", "mala-dos");
    expect(limiter.counts().size).toBe(1);

    const ok = await login("reset@example.com", "contrasena-segura");
    expect(ok.status).toBe(200);

    await login("reset@example.com", "mala-tres");
    await login("reset@example.com", "mala-cuatro");
    const stillAllowed = await login("reset@example.com", "contrasena-segura");
    expect(stillAllowed.status).toBe(200);
  });

  it("401 generico identico para contrasena mala y email inexistente", async () => {
    await registerUser("ana@example.com");

    const wrongPassword = await login("ana@example.com", "no-es-la-clave");
    const ghostEmail = await login("nadie@example.com", "no-es-la-clave");

    expect(wrongPassword.status).toBe(401);
    expect(ghostEmail.status).toBe(401);
    expect(wrongPassword.body.message).toBe(ghostEmail.body.message);
    expect(ApiErrorResponseSchema.safeParse(wrongPassword.body).success).toBe(true);
    expect(ApiErrorResponseSchema.safeParse(ghostEmail.body).success).toBe(true);
  });

  it("el lookup del email es case-insensitive (citext)", async () => {
    await registerUser("carla@example.com");

    const res = await login("CARLA@EXAMPLE.COM", "contrasena-segura");
    expect(res.status).toBe(200);
  });

  it("Gherkin RF-5: el sexto fallo consecutivo responde 429 con Retry-After", async () => {
    await registerUser("diego@example.com");

    for (let i = 0; i < 5; i += 1) {
      const failed = await login("diego@example.com", `intento-malo-${i}`);
      expect(failed.status).toBe(401);
    }

    const blocked = await login("diego@example.com", "intento-malo-5");
    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBeDefined();
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    expect(ApiErrorResponseSchema.safeParse(blocked.body).success).toBe(true);
  });

  it("payload invalido responde 400 validation_failed", async () => {
    const missing = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "x@example.com" });
    expect(missing.status).toBe(400);
    expect(missing.body.path).toBe("/api/v1/auth/login");

    const extra = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "x@example.com", password: "1234567890", extra: true });
    expect(extra.status).toBe(400);
  });
});
