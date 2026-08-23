import { VersioningType } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import fastifyCookie from "@fastify/cookie";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getQueueToken } from "@nestjs/bullmq";

import { PresignAvatarResponseSchema } from "@redsocial/contracts";

import { AppModule } from "../../app.module";
import { EmailService } from "../email/email.service";
import { PrismaService } from "../prisma/prisma.service";
import { FakePrisma } from "../../testing/fake-prisma";
import { LoginRateLimiterService } from "../auth/services/login-rate-limiter.service";
import { MEDIA_QUEUE } from "./users.constants";
import type { MediaJobPayload } from "./users.constants";

const PASSWORD = "contrasena-segura";

describe("POST /users/me/avatar/presign (integracion)", () => {
  let app: NestFastifyApplication;
  const prisma = new FakePrisma();
  const enqueueVerificationEmail = vi.fn().mockResolvedValue(undefined);
  const limiter = new LoginRateLimiterService(null);
  const queueAdd = vi.fn().mockResolvedValue(undefined);

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
      .overrideProvider(getQueueToken(MEDIA_QUEUE))
      .useValue({ add: queueAdd })
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

  async function registerAndLogin(email: string): Promise<string> {
    const register = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password: PASSWORD });
    expect(register.status).toBe(201);

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password: PASSWORD });
    expect(res.status).toBe(200);
    return res.body.accessToken as string;
  }

  it("RF-4: emite PUT firmado y programa el job avatar-process con delay", async () => {
    queueAdd.mockClear();
    const token = await registerAndLogin("alma.presign@example.com");
    const user = prisma.users.find((u) => u.email === "alma.presign@example.com");

    const res = await request(app.getHttpServer())
      .post("/api/v1/users/me/avatar/presign")
      .set("Authorization", `Bearer ${token}`)
      .send({ contentType: "image/png", sizeBytes: 1024 * 512 });

    expect(res.status).toBe(200);
    expect(PresignAvatarResponseSchema.safeParse(res.body).success).toBe(true);

    const keyPrefix = `avatars/${user!.id}/`;
    expect(res.body.key.startsWith(keyPrefix)).toBe(true);
    expect(res.body.key.endsWith(".png")).toBe(true);
    expect(new URL(res.body.uploadUrl).searchParams.has("X-Amz-Signature")).toBe(true);

    expect(queueAdd).toHaveBeenCalledTimes(1);
    const [jobName, payload, options] = queueAdd.mock.calls[0] as [
      string,
      MediaJobPayload,
      Record<string, unknown>,
    ];
    expect(jobName).toBe("avatar-process");
    expect(payload.userId).toBe(user!.id);
    expect(payload.key).toBe(res.body.key);
    expect(options.delay).toBeGreaterThan(10_000);
    expect(options.attempts).toBeGreaterThanOrEqual(3);
  });

  it("rechaza tipos no admitidos y pesos mayores a 2 MB", async () => {
    queueAdd.mockClear();
    const token = await registerAndLogin("bruno.tipo@example.com");

    const badType = await request(app.getHttpServer())
      .post("/api/v1/users/me/avatar/presign")
      .set("Authorization", `Bearer ${token}`)
      .send({ contentType: "image/gif", sizeBytes: 100 });
    expect(badType.status).toBe(400);

    const tooBig = await request(app.getHttpServer())
      .post("/api/v1/users/me/avatar/presign")
      .set("Authorization", `Bearer ${token}`)
      .send({ contentType: "image/jpeg", sizeBytes: 2 * 1024 * 1024 + 1 });
    expect(tooBig.status).toBe(400);

    const negative = await request(app.getHttpServer())
      .post("/api/v1/users/me/avatar/presign")
      .set("Authorization", `Bearer ${token}`)
      .send({ contentType: "image/webp", sizeBytes: -5 });
    expect(negative.status).toBe(400);

    expect(queueAdd).toHaveBeenCalledTimes(0);
  });

  it("exige access token Bearer", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/users/me/avatar/presign")
      .send({ contentType: "image/jpeg", sizeBytes: 100 });
    expect(res.status).toBe(401);
  });
});
