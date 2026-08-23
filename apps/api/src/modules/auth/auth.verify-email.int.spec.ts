import { VersioningType } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import fastifyCookie from "@fastify/cookie";
import { createHash, randomBytes } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { VerifyEmailResponseSchema } from "@redsocial/contracts";

import { AppModule } from "../../app.module";
import { EmailService } from "../email/email.service";
import { PrismaService } from "../prisma/prisma.service";
import { TokensService } from "./tokens.service";
import { FakePrisma } from "../../testing/fake-prisma";

function sha256(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

describe("POST /auth/verify-email y /auth/resend-verification (integracion)", () => {
  let app: NestFastifyApplication;
  const prisma = new FakePrisma();
  const enqueueVerificationEmail = vi.fn().mockResolvedValue(undefined);

  /** Registra un usuario por el endpoint real y devuelve el token crudo encolado. */
  async function registerAndCaptureToken(email: string): Promise<string> {
    enqueueVerificationEmail.mockClear();
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password: "contrasena-segura" });
    expect(res.status).toBe(201);
    expect(enqueueVerificationEmail).toHaveBeenCalledTimes(1);
    const payload = enqueueVerificationEmail.mock.calls[0][0] as { to: string; verifyUrl: string };
    return new URL(payload.verifyUrl).searchParams.get("token") ?? "";
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(EmailService)
      .useValue({ enqueueVerificationEmail })
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

  it("RF-3: verifica el email, inicia sesion y setea la cookie rt httpOnly", async () => {
    const rawToken = await registerAndCaptureToken("beto@example.com");

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/verify-email")
      .set("user-agent", "vitest-agent")
      .send({ token: rawToken });

    expect(res.status).toBe(200);
    expect(VerifyEmailResponseSchema.safeParse(res.body).success).toBe(true);
    expect(res.body.expiresIn).toBe(900);

    // El access token decodifica al usuario recien verificado.
    const tokens = app.get(TokensService);
    const payload = await tokens.verifyAccessToken(res.body.accessToken);
    expect(payload.sub).toBe(prisma.users[0].id);
    expect(payload.email).toBe("beto@example.com");

    // Cookie rf6: httpOnly, SameSite=Lax, limitada a /api/v1/auth.
    const cookieHeader = (res.headers["set-cookie"] ?? []) as unknown as string[];
    const rtCookie = cookieHeader.find((c) => c.startsWith("rt="));
    expect(rtCookie).toBeDefined();
    expect(rtCookie).toContain("HttpOnly");
    expect(rtCookie).toContain("SameSite=Lax");
    expect(rtCookie).toContain("Path=/api/v1/auth");
    // En tests NODE_ENV!=production: sin Secure.
    expect(rtCookie).not.toContain("Secure");

    // D6: cookie csrf legible (sin HttpOnly) y su valor coincide con el cuerpo.
    const csrfCookie = cookieHeader.find((c) => c.startsWith("csrf_token="));
    expect(csrfCookie).toBeDefined();
    expect(csrfCookie).not.toContain("HttpOnly");
    expect(csrfCookie?.match(/csrf_token=([^;]+)/)?.[1]).toBe(res.body.csrfToken);

    // Estado persistido: token usado una sola vez y usuario verificado.
    expect(prisma.emailTokens[0].usedAt).not.toBeNull();
    expect(prisma.users[0].emailVerified).toBe(true);
    expect(prisma.sessions).toHaveLength(1);
    expect(prisma.sessions[0].userAgent).toBe("vitest-agent");
  });

  it("rechaza la reutilizacion del mismo token (un solo uso)", async () => {
    const rawToken = await registerAndCaptureToken("carla@example.com");
    const first = await request(app.getHttpServer())
      .post("/api/v1/auth/verify-email")
      .send({ token: rawToken });
    expect(first.status).toBe(200);

    const second = await request(app.getHttpServer())
      .post("/api/v1/auth/verify-email")
      .send({ token: rawToken });
    expect(second.status).toBe(400);
    expect(second.body.statusCode).toBe(400);
    expect(typeof second.body.message).toBe("string");
  });

  it("rechaza un token expirado", async () => {
    const user = await prisma.user.create({
      data: { email: "expirado@example.com", passwordHash: null },
    });
    const rawToken = randomBytes(32).toString("base64url");
    await prisma.emailToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(rawToken),
        type: "verify_email",
        expiresAt: new Date(Date.now() - 1000),
        usedAt: null,
      },
    });

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/verify-email")
      .send({ token: rawToken });

    expect(res.status).toBe(400);
  });

  it("RF-3 parcial: resend invalida el enlace anterior y emite uno nuevo", async () => {
    const oldToken = await registerAndCaptureToken("diana@example.com");

    enqueueVerificationEmail.mockClear();
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/resend-verification")
      .send({ email: "diana@example.com" });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ accepted: true });
    expect(enqueueVerificationEmail).toHaveBeenCalledTimes(1);

    // El enlace anterior queda invalidado; el nuevo verifica correctamente.
    const oldAttempt = await request(app.getHttpServer())
      .post("/api/v1/auth/verify-email")
      .send({ token: oldToken });
    expect(oldAttempt.status).toBe(400);

    const newPayload = enqueueVerificationEmail.mock.calls[0][0] as {
      to: string;
      verifyUrl: string;
    };
    const newToken = new URL(newPayload.verifyUrl).searchParams.get("token") ?? "";
    const verifyNew = await request(app.getHttpServer())
      .post("/api/v1/auth/verify-email")
      .send({ token: newToken });
    expect(verifyNew.status).toBe(200);
  });

  it("resend responde 202 incluso para emails sin cuenta (anti-enumeracion)", async () => {
    enqueueVerificationEmail.mockClear();
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/resend-verification")
      .send({ email: "fantasma@example.com" });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ accepted: true });
    expect(enqueueVerificationEmail).not.toHaveBeenCalled();
  });

  it("valida payloads con la forma del contrato de errores", async () => {
    const shortToken = await request(app.getHttpServer())
      .post("/api/v1/auth/verify-email")
      .send({ token: "corto" });
    expect(shortToken.status).toBe(400);
    expect(shortToken.body.path).toBe("/api/v1/auth/verify-email");

    const badResend = await request(app.getHttpServer())
      .post("/api/v1/auth/resend-verification")
      .send({ email: "no-es-email" });
    expect(badResend.status).toBe(400);
    expect(typeof badResend.body.message).toBe("string");
  });
});
