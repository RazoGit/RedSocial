import { VersioningType } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import fastifyCookie from "@fastify/cookie";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AcceptedResponseSchema, ResetPasswordResponseSchema } from "@redsocial/contracts";

import { AppModule } from "../../app.module";
import { EmailService } from "../email/email.service";
import type { PasswordResetEmailPayload } from "../email/email.constants";
import { PrismaService } from "../prisma/prisma.service";
import { FakePrisma } from "../../testing/fake-prisma";

const PASSWORD = "contrasena-segura";
const NEW_PASSWORD = "otra-clave-segura-99";

describe("POST /auth/forgot-password y /auth/reset-password (integracion)", () => {
  let app: NestFastifyApplication;
  const prisma = new FakePrisma();
  const enqueueVerificationEmail = vi.fn().mockResolvedValue(undefined);
  const enqueuePasswordResetEmail = vi.fn().mockResolvedValue(undefined);
  const enqueuePasswordChangedEmail = vi.fn().mockResolvedValue(undefined);

  /** forgot-password real; devuelve el token crudo capturado del enlace encolado. */
  async function requestReset(email: string): Promise<string> {
    enqueuePasswordResetEmail.mockClear();
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/forgot-password")
      .send({ email });
    expect(res.status).toBe(202);
    const payload = enqueuePasswordResetEmail.mock.calls.at(-1)?.[0] as
      PasswordResetEmailPayload | undefined;
    if (!payload) throw new Error("no se encolo el email de restablecimiento");
    return new URL(payload.resetUrl).searchParams.get("token") ?? "";
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(EmailService)
      .useValue({
        enqueueVerificationEmail,
        enqueuePasswordResetEmail,
        enqueuePasswordChangedEmail,
      })
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.register(fastifyCookie);
    app.setGlobalPrefix("api");
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    // Cuenta local con sesion activa (login real por el endpoint).
    await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: "ana@example.com", password: PASSWORD });
    prisma.users[0].emailVerified = true;
    await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "ana@example.com", password: PASSWORD });
  });

  afterAll(async () => {
    await app.close();
  });

  it("RF-11: responde 202 identico para emails con o sin cuenta (anti-enumeracion)", async () => {
    enqueuePasswordResetEmail.mockClear();

    const known = await request(app.getHttpServer())
      .post("/api/v1/auth/forgot-password")
      .send({ email: "ana@example.com" });
    const unknown = await request(app.getHttpServer())
      .post("/api/v1/auth/forgot-password")
      .send({ email: "nadie@example.com" });

    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(unknown.body).toEqual(known.body);
    expect(AcceptedResponseSchema.safeParse(known.body).success).toBe(true);
    // Solo la cuenta existente recibe enlace.
    expect(enqueuePasswordResetEmail).toHaveBeenCalledTimes(1);
  });

  it("RF-12: reset valido cambia la contrasena, revoca sesiones y notifica", async () => {
    const token = await requestReset("ana@example.com");
    const sessionBefore = prisma.sessions[prisma.sessions.length - 1];
    expect(sessionBefore?.revokedAt).toBeNull();

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/reset-password")
      .send({ token, password: NEW_PASSWORD });

    expect(res.status).toBe(200);
    expect(ResetPasswordResponseSchema.safeParse(res.body).success).toBe(true);
    expect(prisma.emailTokens.find((t) => t.type === "password_reset")?.usedAt).not.toBeNull();
    // Todas las sesiones del usuario quedaron revocadas.
    for (const session of prisma.sessions.filter((s) => s.userId === prisma.users[0].id)) {
      expect(session.revokedAt).not.toBeNull();
    }
    expect(enqueuePasswordChangedEmail).toHaveBeenCalledWith({ to: "ana@example.com" });
  });

  it("tras el reset: la contrasena vieja falla y la nueva permite login", async () => {
    const oldLogin = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "ana@example.com", password: PASSWORD });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "ana@example.com", password: NEW_PASSWORD });
    expect(newLogin.status).toBe(200);
  });

  it("RF-12: el mismo token no puede reutilizarse (un solo uso)", async () => {
    const token = await requestReset("ana@example.com");
    const first = await request(app.getHttpServer())
      .post("/api/v1/auth/reset-password")
      .send({ token, password: PASSWORD });
    expect(first.status).toBe(200);

    const second = await request(app.getHttpServer())
      .post("/api/v1/auth/reset-password")
      .send({ token, password: NEW_PASSWORD });
    expect(second.status).toBe(400);
    expect(second.body.message).toBe("Token invalido o expirado");
  });

  it("reset con token invalido responde 400 con el contrato de errores", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/reset-password")
      .send({
        token: "a".repeat(43),
        password: NEW_PASSWORD,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Token invalido o expirado");
  });

  it("valida payloads con la forma del contrato de errores", async () => {
    const badForgot = await request(app.getHttpServer())
      .post("/api/v1/auth/forgot-password")
      .send({ email: "no-es-un-email" });
    expect(badForgot.status).toBe(400);
    expect(badForgot.body.message).toBe("validation_failed");

    const badReset = await request(app.getHttpServer())
      .post("/api/v1/auth/reset-password")
      .send({ token: "corto", password: NEW_PASSWORD });
    expect(badReset.status).toBe(400);
  });
});
