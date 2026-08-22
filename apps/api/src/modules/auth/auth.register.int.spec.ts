import { VersioningType, type INestApplication } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { createHash } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { RegisterResponseSchema } from "@redsocial/contracts";

import { AppModule } from "../../app.module";
import { EmailService } from "../email/email.service";
import { PrismaService } from "../prisma/prisma.service";
import { FakePrisma } from "../../testing/fake-prisma";

describe("POST /auth/register (integracion)", () => {
  let app: INestApplication;
  const prisma = new FakePrisma();
  const enqueueVerificationEmail = vi.fn().mockResolvedValue(undefined);

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
    app.setGlobalPrefix("api");
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("RF-2: registra cuenta inactiva, persiste hash del token y encola el email", async () => {
    enqueueVerificationEmail.mockClear();
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: "ana@example.com", password: "contrasena-segura" });

    expect(res.status).toBe(201);
    expect(RegisterResponseSchema.safeParse(res.body).success).toBe(true);
    expect(res.body).toMatchObject({ email: "ana@example.com", emailVerified: false });

    expect(prisma.users).toHaveLength(1);
    expect(prisma.users[0].passwordHash).toMatch(/^\$argon2id\$/);

    expect(enqueueVerificationEmail).toHaveBeenCalledTimes(1);
    const payload = enqueueVerificationEmail.mock.calls[0][0] as {
      to: string;
      verifyUrl: string;
    };
    expect(payload.to).toBe("ana@example.com");

    const url = new URL(payload.verifyUrl);
    expect(url.pathname).toBe("/verify-email");
    const rawToken = url.searchParams.get("token") ?? "";
    expect(Buffer.from(rawToken, "base64url")).toHaveLength(32);

    const stored = prisma.emailTokens[0];
    expect(stored.type).toBe("verify_email");
    expect(stored.tokenHash).toBe(createHash("sha256").update(rawToken).digest("hex"));
    const ttlHours = (stored.expiresAt.getTime() - Date.now()) / 3_600_000;
    expect(ttlHours).toBeGreaterThan(23);
    expect(ttlHours).toBeLessThanOrEqual(24);
  });

  it("RF-1: duplicado case-insensitive responde 409 con mensaje generico identico", async () => {
    const first = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: "ana@example.com", password: "otra-contrasena" });
    expect(first.status).toBe(409);

    const second = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: "ANA@EXAMPLE.COM", password: "distinta-contrasena" });
    expect(second.status).toBe(409);
    expect(second.body.message).toBe(first.body.message);

    // El mensaje generico no revela estado de la cuenta.
    expect(first.body.message).not.toContain("ana");
  });

  it("rechaza contrasena corta con la forma del contrato de errores", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: "corta@example.com", password: "12345678" });

    expect(res.status).toBe(400);
    expect(res.body.statusCode).toBe(400);
    expect(typeof res.body.message).toBe("string");
    expect(res.body.path).toBe("/api/v1/auth/register");
    expect(typeof res.body.timestamp).toBe("string");
  });

  it("rechaza campos desconocidos (esquema estricto)", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: "extra@example.com", password: "contrasena-larga", isAdmin: true });

    expect(res.status).toBe(400);
    expect(res.body.statusCode).toBe(400);
  });
});
