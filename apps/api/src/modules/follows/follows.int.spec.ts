import { VersioningType } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import fastifyCookie from "@fastify/cookie";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { FeedResponseSchema, FollowResponseSchema } from "@redsocial/contracts";

import { AppModule } from "../../app.module";
import { EmailService } from "../email/email.service";
import { PrismaService } from "../prisma/prisma.service";
import { FakePrisma } from "../../testing/fake-prisma";
import { LoginRateLimiterService } from "../auth/services/login-rate-limiter.service";

const PASSWORD = "contrasena-segura";

describe("Social Graph: follow, unfollow y feed (integracion)", () => {
  let app: NestFastifyApplication;
  const prisma = new FakePrisma();
  const enqueueVerificationEmail = vi.fn().mockResolvedValue(undefined);
  const limiter = new LoginRateLimiterService(null);

  async function register(email: string): Promise<void> {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password: PASSWORD });
    expect(res.status).toBe(201);
  }

  async function login(email: string): Promise<string> {
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

    await register("alice.follow@example.com");
    await register("bob.follow@example.com");
  });

  afterAll(async () => {
    await app.close();
  });

  describe("POST /users/:username/follow", () => {
    it("RF-7: seguir a un usuario retorna follow=true con contadores", async () => {
      const token = await login("alice.follow@example.com");

      const res = await request(app.getHttpServer())
        .post("/api/v1/users/bob_follow/follow")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(201);
      expect(FollowResponseSchema.safeParse(res.body).success).toBe(true);
      expect(res.body.following).toBe(true);
      expect(typeof res.body.followersCount).toBe("number");
      expect(typeof res.body.followingCount).toBe("number");
    });

    it("el perfil del seguido muestra followersCount", async () => {
      const profile = await request(app.getHttpServer()).get("/api/v1/users/bob_follow");
      expect(profile.status).toBe(200);
      expect(profile.body.followersCount).toBeGreaterThanOrEqual(1);
    });

    it("el perfil del seguidor muestra followingCount", async () => {
      const token = await login("alice.follow@example.com");

      const me = await request(app.getHttpServer())
        .get("/api/v1/users/alice_follow")
        .set("Authorization", `Bearer ${token}`);
      expect(me.status).toBe(200);
      expect(me.body.followingCount).toBeGreaterThanOrEqual(1);
    });

    it("seguir a alguien ya seguido retorna 409", async () => {
      const token = await login("alice.follow@example.com");

      const res = await request(app.getHttpServer())
        .post("/api/v1/users/bob_follow/follow")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(409);
    });

    it("no puedes seguirte a ti mismo retorna 400", async () => {
      const token = await login("alice.follow@example.com");

      const res = await request(app.getHttpServer())
        .post("/api/v1/users/alice_follow/follow")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /users/:username/follow", () => {
    it("dejar de seguir retorna following=false", async () => {
      const token = await login("alice.follow@example.com");

      const res = await request(app.getHttpServer())
        .delete("/api/v1/users/bob_follow/follow")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(FollowResponseSchema.safeParse(res.body).success).toBe(true);
      expect(res.body.following).toBe(false);
    });

    it("dejar de seguir a alguien no seguido retorna 404", async () => {
      const token = await login("alice.follow@example.com");

      const res = await request(app.getHttpServer())
        .delete("/api/v1/users/bob_follow/follow")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  describe("GET /feed", () => {
    it("feed vacío cuando no sigue a nadie", async () => {
      const token = await login("alice.follow@example.com");

      const res = await request(app.getHttpServer())
        .get("/api/v1/feed")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(FeedResponseSchema.safeParse(res.body).success).toBe(true);
      expect(res.body.items).toHaveLength(0);
      expect(res.body.nextCursor).toBeNull();
    });

    it("feed muestra posts de usuarios seguidos", async () => {
      await register("charlie.feed@example.com");
      const aliceToken = await login("alice.follow@example.com");
      const charlieToken = await login("charlie.feed@example.com");

      // Alice sigue a Charlie
      await request(app.getHttpServer())
        .post("/api/v1/users/charlie_feed/follow")
        .set("Authorization", `Bearer ${aliceToken}`);

      // Charlie crea un post
      const postRes = await request(app.getHttpServer())
        .post("/api/v1/posts")
        .set("Authorization", `Bearer ${charlieToken}`)
        .send({ text: "Post de Charlie para el feed" });
      expect(postRes.status).toBe(201);

      // Alice consulta el feed
      const feedRes = await request(app.getHttpServer())
        .get("/api/v1/feed")
        .set("Authorization", `Bearer ${aliceToken}`);

      expect(feedRes.status).toBe(200);
      expect(FeedResponseSchema.safeParse(feedRes.body).success).toBe(true);
      expect(feedRes.body.items.length).toBeGreaterThanOrEqual(1);
      expect(feedRes.body.items[0].author.username).toBe("charlie_feed");
    });
  });
});
