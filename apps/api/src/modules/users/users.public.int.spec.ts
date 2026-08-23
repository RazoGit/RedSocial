import { VersioningType } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import fastifyCookie from "@fastify/cookie";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { MinimalProfileResponseSchema, UserProfileResponseSchema } from "@redsocial/contracts";

import { AppModule } from "../../app.module";
import { EmailService } from "../email/email.service";
import { PrismaService } from "../prisma/prisma.service";
import { FakePrisma } from "../../testing/fake-prisma";
import { LoginRateLimiterService } from "../auth/services/login-rate-limiter.service";

const PASSWORD = "contrasena-segura";

describe("GET /users/:username: perfil publico con vista minima y cache (integracion)", () => {
  let app: NestFastifyApplication;
  const prisma = new FakePrisma();
  const enqueueVerificationEmail = vi.fn().mockResolvedValue(undefined);
  const limiter = new LoginRateLimiterService(null);

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

  it("RF-5: perfil publico sin token entrega la vista completa", async () => {
    await registerAndLogin("marta.gil@example.com"); // username marta_gil

    const res = await request(app.getHttpServer()).get("/api/v1/users/marta_gil");

    expect(res.status).toBe(200);
    expect(UserProfileResponseSchema.safeParse(res.body).success).toBe(true);
    expect(res.body).toMatchObject({
      username: "marta_gil",
      displayName: null,
      bio: null,
      avatarUrl: null,
      avatarBlurhash: null,
      isPrivate: false,
      emailVerified: false,
    });
    expect(typeof res.body.id).toBe("string");
  });

  it("Gherkin §6: perfil privado ante terceros solo expone username, displayName y avatar", async () => {
    const token = await registerAndLogin("nuria.camps@example.com");
    const row = prisma.users.find((u) => u.email === "nuria.camps@example.com")!;
    row.avatarThumbKey = `avatars/${row.id}/thumb.webp`;

    const patch = await request(app.getHttpServer())
      .patch("/api/v1/users/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ isPrivate: true, displayName: "Nuria Camps" });
    expect(patch.status).toBe(200);

    const anon = await request(app.getHttpServer()).get("/api/v1/users/nuria_camps");
    expect(anon.status).toBe(200);
    expect(MinimalProfileResponseSchema.safeParse(anon.body).success).toBe(true);
    expect(Object.keys(anon.body).sort()).toEqual([
      "avatarBlurhash",
      "avatarUrl",
      "displayName",
      "username",
    ]);
    expect(anon.body.displayName).toBe("Nuria Camps");
    // La URL del avatar esta firmada aunque el perfil sea privado.
    expect(anon.body.avatarUrl).toContain("X-Amz-Signature");

    const owner = await request(app.getHttpServer())
      .get("/api/v1/users/nuria_camps")
      .set("Authorization", `Bearer ${token}`);
    expect(owner.status).toBe(200);
    expect(UserProfileResponseSchema.safeParse(owner.body).success).toBe(true);
    expect(owner.body.isPrivate).toBe(true);
    expect(typeof owner.body.id).toBe("string");

    const otherToken = await registerAndLogin("otro.espectador@example.com");
    const other = await request(app.getHttpServer())
      .get("/api/v1/users/nuria_camps")
      .set("Authorization", `Bearer ${otherToken}`);
    expect(other.status).toBe(200);
    expect(MinimalProfileResponseSchema.safeParse(other.body).success).toBe(true);
    expect(other.body.username).toBe("nuria_camps");
  });

  it("NFR: la caché sirve lecturas repetidas y PATCH la invalida", async () => {
    const token = await registerAndLogin("carla.torres@example.com");
    const row = prisma.users.find((u) => u.email === "carla.torres@example.com")!;

    const first = await request(app.getHttpServer()).get("/api/v1/users/carla_torres");
    expect(first.status).toBe(200);
    expect(first.body.displayName).toBeNull();

    // Mutacion directa en la "base de datos": si hay caché, no se ve.
    row.displayName = "Mutada por debajo";

    const cached = await request(app.getHttpServer()).get("/api/v1/users/carla_torres");
    expect(cached.status).toBe(200);
    expect(cached.body.displayName).toBeNull();

    const patch = await request(app.getHttpServer())
      .patch("/api/v1/users/me")
      .set("Authorization", `Bearer ${token}`)
      .send({ displayName: "Carla T" });
    expect(patch.status).toBe(200);

    const fresh = await request(app.getHttpServer()).get("/api/v1/users/carla_torres");
    expect(fresh.status).toBe(200);
    expect(fresh.body.displayName).toBe("Carla T");
  });

  it("404 para usernames inexistentes o cuentas borradas", async () => {
    const missing = await request(app.getHttpServer()).get("/api/v1/users/nadie_nadie");
    expect(missing.status).toBe(404);
    expect(missing.body.message).toBe("usuario_no_encontrado");
  });
});
