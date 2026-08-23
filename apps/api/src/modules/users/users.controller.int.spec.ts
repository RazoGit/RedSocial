import { VersioningType } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import fastifyCookie from "@fastify/cookie";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { MeProfileResponseSchema } from "@redsocial/contracts";

import { AppModule } from "../../app.module";
import { EmailService } from "../email/email.service";
import { PrismaService } from "../prisma/prisma.service";
import { FakePrisma } from "../../testing/fake-prisma";
import { LoginRateLimiterService } from "../auth/services/login-rate-limiter.service";

const PASSWORD = "contrasena-segura";

interface Session {
  accessToken: string;
}

describe("UsersController: /users/me y check-username (integracion)", () => {
  let app: NestFastifyApplication;
  const prisma = new FakePrisma();
  const enqueueVerificationEmail = vi.fn().mockResolvedValue(undefined);
  const limiter = new LoginRateLimiterService(null);

  async function registerAndLogin(email: string): Promise<Session> {
    const register = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password: PASSWORD });
    expect(register.status).toBe(201);

    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password: PASSWORD });
    expect(res.status).toBe(200);
    return { accessToken: res.body.accessToken as string };
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

  it("T4 GET /me: devuelve el perfil con username provisional derivado del email", async () => {
    const session = await registerAndLogin("raul.mendo@example.com");
    const user = prisma.users.find((u) => u.email === "raul.mendo@example.com");
    expect(user?.username).toBe("raul_mendo");

    const res = await request(app.getHttpServer())
      .get("/api/v1/users/me")
      .set("Authorization", `Bearer ${session.accessToken}`);

    expect(res.status).toBe(200);
    expect(MeProfileResponseSchema.safeParse(res.body).success).toBe(true);
    expect(res.body).toMatchObject({
      id: user?.id,
      email: "raul.mendo@example.com",
      emailVerified: false,
      username: "raul_mendo",
      displayName: null,
      bio: null,
      avatarUrl: null,
      isPrivate: false,
    });
    expect(typeof res.body.updatedAt).toBe("string");
  });

  it("T4: exige access token Bearer", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/users/me");
    expect(res.status).toBe(401);
    expect(typeof res.body.message).toBe("string");
  });

  it("T4 PATCH /me: actualiza campos parciales y audita updatedAt (RF-6)", async () => {
    const session = await registerAndLogin("sofia.rey@example.com");
    const row = prisma.users.find((u) => u.email === "sofia.rey@example.com");
    const createdAtBefore = row!.updatedAt.getTime();

    const res = await request(app.getHttpServer())
      .patch("/api/v1/users/me")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .send({ displayName: "Sofia Rey", bio: "Disenando cosas" });

    expect(res.status).toBe(200);
    expect(MeProfileResponseSchema.safeParse(res.body).success).toBe(true);
    expect(res.body).toMatchObject({ displayName: "Sofia Rey", bio: "Disenando cosas" });
    expect(new Date(res.body.updatedAt as string).getTime()).toBeGreaterThan(createdAtBefore);

    // PATCH parcial posterior no borra lo ya guardado.
    const second = await request(app.getHttpServer())
      .patch("/api/v1/users/me")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .send({ isPrivate: true });

    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({
      displayName: "Sofia Rey",
      bio: "Disenando cosas",
      isPrivate: true,
    });
  });

  it("T4: rechaza campos desconocidos y payloads vacios", async () => {
    const session = await registerAndLogin("tomas.vila@example.com");

    const unknown = await request(app.getHttpServer())
      .patch("/api/v1/users/me")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .send({ role: "admin" });
    expect(unknown.status).toBe(400);

    const empty = await request(app.getHttpServer())
      .patch("/api/v1/users/me")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .send({});
    expect(empty.status).toBe(400);
  });

  it("T5 RF-3: primer cambio de username es gratis y reserva el anterior 30 dias", async () => {
    const session = await registerAndLogin("ursula.prats@example.com");
    const row = prisma.users.find((u) => u.email === "ursula.prats@example.com");
    expect(row?.username).toBe("ursula_prats");
    expect(row?.usernameChangedAt).toBeNull();

    const res = await request(app.getHttpServer())
      .patch("/api/v1/users/me")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .send({ username: "usurpa" });

    expect(res.status).toBe(200);
    expect(res.body.username).toBe("usurpa");

    const historyRow = prisma.usernameHistoryRows.find((h) => h.userId === row?.id);
    expect(historyRow?.username).toBe("ursula_prats");
    const days = (historyRow!.releasedAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThanOrEqual(30);

    const after = prisma.users.find((u) => u.id === row?.id);
    expect(after?.usernameChangedAt).not.toBeNull();
  });

  it("T5 RF-3: segundo cambio dentro de 14 dias responde 422 cooldown", async () => {
    const session = await registerAndLogin("victor.nadal@example.com");
    const first = await request(app.getHttpServer())
      .patch("/api/v1/users/me")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .send({ username: "victor_n" });
    expect(first.status).toBe(200);

    const second = await request(app.getHttpServer())
      .patch("/api/v1/users/me")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .send({ username: "victor_x" });

    expect(second.status).toBe(422);
    expect(second.body.message).toBe("username_cooldown_activo");
  });

  it("T5 RF-2: rechaza reservados sin consumir el cambio gratis", async () => {
    const session = await registerAndLogin("wanda.lara@example.com");
    const row = prisma.users.find((u) => u.email === "wanda.lara@example.com");

    const res = await request(app.getHttpServer())
      .patch("/api/v1/users/me")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .send({ username: "admin" });

    expect(res.status).toBe(422);
    expect(res.body.message).toBe("username_reservado");
    expect(prisma.users.find((u) => u.id === row?.id)?.usernameChangedAt).toBeNull();
    expect(prisma.usernameHistoryRows.some((h) => h.userId === row?.id)).toBe(false);
  });

  it("T5 RF-2: username ocupado por otro usuario responde 409", async () => {
    await registerAndLogin("xavier.pons@gmail.com"); // username: xavier_pons
    const session = await registerAndLogin("yeray.vega@gmail.com");

    // Mayusculas nunca pasa el contrato (400); el choque real es exacto.
    const upper = await request(app.getHttpServer())
      .patch("/api/v1/users/me")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .send({ username: "XAVIER_PONS" });
    expect(upper.status).toBe(400);

    const res = await request(app.getHttpServer())
      .patch("/api/v1/users/me")
      .set("Authorization", `Bearer ${session.accessToken}`)
      .send({ username: "xavier_pons" });

    expect(res.status).toBe(409);
    expect(res.body.message).toBe("username_tomado");
  });

  it("T6: check-username publico clasifica taken/reserved/invalid", async () => {
    const free = await request(app.getHttpServer()).get(
      "/api/v1/users/check-username?u=disponible_libre",
    );
    expect(free.status).toBe(200);
    expect(free.body).toEqual({ available: true });

    const taken = await request(app.getHttpServer()).get(
      "/api/v1/users/check-username?u=xavier_pons",
    );
    expect(taken.status).toBe(200);
    expect(taken.body).toEqual({ available: false, reason: "taken" });

    const reserved = await request(app.getHttpServer()).get(
      "/api/v1/users/check-username?u=support",
    );
    expect(reserved.status).toBe(200);
    expect(reserved.body).toEqual({ available: false, reason: "reserved" });

    const invalid = await request(app.getHttpServer()).get(
      "/api/v1/users/check-username?u=no-valido",
    );
    expect(invalid.status).toBe(200);
    expect(invalid.body).toEqual({ available: false, reason: "invalid_format" });

    const missing = await request(app.getHttpServer()).get("/api/v1/users/check-username");
    expect(missing.status).toBe(400);
  });
});
