import { VersioningType } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import fastifyCookie from "@fastify/cookie";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { ApiErrorResponseSchema, LogoutResponseSchema } from "@redsocial/contracts";

import { AppModule } from "../../app.module";
import { EmailService } from "../email/email.service";
import { PrismaService } from "../prisma/prisma.service";
import { TokensService } from "./tokens.service";
import { LoginRateLimiterService } from "./services/login-rate-limiter.service";
import { FakePrisma } from "../../testing/fake-prisma";

const PASSWORD = "contrasena-segura";

interface SessionCookies {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
}

function cookieValue(setCookie: string[], name: string): string | undefined {
  const found = setCookie.find((c) => c.startsWith(`${name}=`));
  return found?.match(new RegExp(`${name}=([^;]+)`))?.[1];
}

describe("T10: logout, logout-all y me (integracion)", () => {
  let app: NestFastifyApplication;
  const prisma = new FakePrisma();
  const enqueueVerificationEmail = vi.fn().mockResolvedValue(undefined);
  const limiter = new LoginRateLimiterService(null);

  async function registerAndLogin(email: string): Promise<SessionCookies> {
    const register = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password: PASSWORD });
    expect(register.status).toBe(201);
    return loginOnly(email);
  }

  async function loginOnly(email: string): Promise<SessionCookies> {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password: PASSWORD });
    expect(res.status).toBe(200);

    const setCookie = (res.headers["set-cookie"] ?? []) as unknown as string[];
    const refreshToken = cookieValue(setCookie, "rt");
    const csrfToken = cookieValue(setCookie, "csrf_token");
    if (!refreshToken || !csrfToken) throw new Error("login no emitio cookies de sesion");
    return { accessToken: res.body.accessToken as string, refreshToken, csrfToken };
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

  afterAll(async () => {
    await app.close();
  });

  it("RF-10: logout revoca la sesion actual por sid y limpia las cookies", async () => {
    const session = await registerAndLogin("beto@example.com");
    const sessionId = prisma.sessions.find((s) => s.revokedAt === null)?.id;
    expect(sessionId).toBeDefined();

    const payload = await app.get(TokensService).verifyAccessToken(session.accessToken);
    expect(payload.sid).toBe(sessionId);

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .set("X-CSRF-Token", session.csrfToken)
      .set("Cookie", `rt=${session.refreshToken}; csrf_token=${session.csrfToken}`);

    expect(res.status).toBe(200);
    expect(LogoutResponseSchema.safeParse(res.body).success).toBe(true);
    expect(prisma.sessions.find((s) => s.id === sessionId)?.revokedAt).not.toBeNull();

    const setCookie = (res.headers["set-cookie"] ?? []) as unknown as string[];
    for (const name of ["rt", "csrf_token"]) {
      const cleared = setCookie.find((c) => c.startsWith(`${name}=`));
      expect(cleared).toBeDefined();
      expect(cleared).toContain("Expires=Thu, 01 Jan 1970");
    }

    // El refresh con el token recien revocado cae en la deteccion de reuso.
    const reuse = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("X-CSRF-Token", session.csrfToken)
      .set("Cookie", `rt=${session.refreshToken}; csrf_token=${session.csrfToken}`);
    expect(reuse.status).toBe(401);
    expect(reuse.body.message).toBe("token_reuse_detected");
  });

  it("logout exige header X-CSRF-Token igual a la cookie y no revoca si falla", async () => {
    const session = await registerAndLogin("carla@example.com");
    const activeBefore = prisma.sessions.filter((s) => s.revokedAt === null).length;

    const missing = await request(app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .set("Cookie", `rt=${session.refreshToken}; csrf_token=${session.csrfToken}`);
    expect(missing.status).toBe(403);
    expect(missing.body.message).toBe("csrf_invalid");

    const wrong = await request(app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .set("X-CSRF-Token", "otro-token")
      .set("Cookie", `rt=${session.refreshToken}; csrf_token=${session.csrfToken}`);
    expect(wrong.status).toBe(403);
    expect(ApiErrorResponseSchema.safeParse(wrong.body).success).toBe(true);

    expect(prisma.sessions.filter((s) => s.revokedAt === null).length).toBe(activeBefore);
  });

  it("logout requiere access token valido", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set("X-CSRF-Token", "x")
      .set("Cookie", "csrf_token=x");
    expect(res.status).toBe(401);
    expect(ApiErrorResponseSchema.safeParse(res.body).success).toBe(true);
  });

  it("RF-10: logout-all revoca todas las sesiones del usuario y solo las suyas", async () => {
    const first = await registerAndLogin("diego@example.com");
    const second = await loginOnly("diego@example.com");
    const other = await registerAndLogin("elena@example.com");
    expect(prisma.sessions.filter((s) => s.revokedAt === null)).toHaveLength(4);

    const diegoUserId = prisma.users.find((u) => u.email === "diego@example.com")?.id;
    expect(diegoUserId).toBeDefined();

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/logout-all")
      .set("Authorization", `Bearer ${first.accessToken}`)
      .set("X-CSRF-Token", first.csrfToken)
      .set("Cookie", `rt=${first.refreshToken}; csrf_token=${first.csrfToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(prisma.sessions.every((s) => s.userId !== diegoUserId || s.revokedAt !== null)).toBe(
      true,
    );
    expect(prisma.sessions.some((s) => s.userId !== diegoUserId && s.revokedAt === null)).toBe(
      true,
    );

    for (const revoked of [first, second]) {
      const reuse = await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .set("X-CSRF-Token", revoked.csrfToken)
        .set("Cookie", `rt=${revoked.refreshToken}; csrf_token=${revoked.csrfToken}`);
      expect(reuse.status).toBe(401);
    }

    // La sesion de elena sigue viva y puede renovarse.
    const renewed = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("X-CSRF-Token", other.csrfToken)
      .set("Cookie", `rt=${other.refreshToken}; csrf_token=${other.csrfToken}`);
    expect(renewed.status).toBe(200);
  });

  it("GET /me devuelve el perfil publico y falla si la cuenta fue borrada", async () => {
    const session = await registerAndLogin("flor@example.com");
    const user = prisma.users.find((u) => u.email === "flor@example.com");
    expect(user).toBeDefined();

    const ok = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${session.accessToken}`);
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ id: user?.id, email: "flor@example.com", emailVerified: false });

    if (user) user.deletedAt = new Date();
    const gone = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${session.accessToken}`);
    expect(gone.status).toBe(401);
    expect(gone.body.message).toBe("user_not_found");
  });
});
