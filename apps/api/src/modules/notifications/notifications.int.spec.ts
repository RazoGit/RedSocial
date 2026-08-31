import { VersioningType } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import fastifyCookie from "@fastify/cookie";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../../app.module";
import { EmailService } from "../email/email.service";
import { PrismaService } from "../prisma/prisma.service";
import { FakePrisma } from "../../testing/fake-prisma";
import { LoginRateLimiterService } from "../auth/services/login-rate-limiter.service";

const PASSWORD = "contrasena-segura";

describe("Notificaciones (integracion spec 007)", () => {
  let app: NestFastifyApplication;
  const prisma = new FakePrisma();
  const limiter = new LoginRateLimiterService(null);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(EmailService)
      .useValue({ enqueueVerificationEmail: async () => {} })
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

  async function registerAndLogin(email: string): Promise<string> {
    await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password: PASSWORD });
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password: PASSWORD });
    return res.body.accessToken as string;
  }

  async function seedNotifications(userId: string, actorId: string): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < 25; i += 1) {
      const row = await prisma.notification.create({
        data: { userId, actorId, type: "like", postId: `p${i}` },
      });
      ids.push(row.id);
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    return ids;
  }

  describe("GET /api/v1/notifications", () => {
    it("T10: lista paginada con unreadCount y nextCursor", async () => {
      const token = await registerAndLogin("notif-list@example.com");
      const self = prisma.users.find((u) => u.email === "notif-list@example.com")!;
      await prisma.user.create({ data: { email: "actor-list@example.com", emailVerified: true } });
      const actor = prisma.users.find((u) => u.email === "actor-list@example.com")!;
      actor.username = "actor-list";
      await seedNotifications(self.id, actor.id);

      const page1 = await request(app.getHttpServer())
        .get("/api/v1/notifications?limit=20")
        .set("Authorization", `Bearer ${token}`);
      expect(page1.status).toBe(200);
      expect(page1.body.items).toHaveLength(20);
      expect(page1.body.unreadCount).toBe(25);
      expect(page1.body.nextCursor).toBeTypeOf("string");

      const page2 = await request(app.getHttpServer())
        .get(`/api/v1/notifications?limit=20&createdBefore=${page1.body.nextCursor}`)
        .set("Authorization", `Bearer ${token}`);
      expect(page2.status).toBe(200);
      expect(page2.body.items).toHaveLength(5);
      expect(page2.body.nextCursor).toBeNull();

      const item = page1.body.items[0];
      expect(item.type).toBe("like");
      expect(item.read).toBe(false);
      expect(item.actor.username).toBe("actor-list");
    });

    it("T10: sin token responde 401", async () => {
      const res = await request(app.getHttpServer()).get("/api/v1/notifications");
      expect(res.status).toBe(401);
    });
  });

  describe("PATCH /api/v1/notifications/:id/read", () => {
    it("T11: el dueno marca y se emite unreadCount decrementado", async () => {
      const token = await registerAndLogin("notif-read@example.com");
      const self = prisma.users.find((u) => u.email === "notif-read@example.com")!;
      await prisma.user.create({ data: { email: "actor-read@example.com", emailVerified: true } });
      const actor = prisma.users.find((u) => u.email === "actor-read@example.com")!;
      const [row] = await seedNotifications(self.id, actor.id);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/notifications/${row}/read`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: row, read: true });

      const count = await request(app.getHttpServer())
        .get("/api/v1/notifications/unread-count")
        .set("Authorization", `Bearer ${token}`);
      expect(count.body.unreadCount).toBe(24);
    });

    it("T11: notificacion ajena responde 404", async () => {
      const token = await registerAndLogin("notif-other@example.com");
      await registerAndLogin("notif-owner@example.com");
      const owner = prisma.users.find((u) => u.email === "notif-owner@example.com")!;
      await prisma.user.create({ data: { email: "actor-other@example.com", emailVerified: true } });
      const actor = prisma.users.find((u) => u.email === "actor-other@example.com")!;
      const [row] = await seedNotifications(owner.id, actor.id);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/notifications/${row}/read`)
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/v1/notifications/read-all", () => {
    it("T11: marca todas las no leidas", async () => {
      const token = await registerAndLogin("notif-all@example.com");
      const self = prisma.users.find((u) => u.email === "notif-all@example.com")!;
      await prisma.user.create({ data: { email: "actor-all@example.com", emailVerified: true } });
      const actor = prisma.users.find((u) => u.email === "actor-all@example.com")!;
      await seedNotifications(self.id, actor.id);

      const res = await request(app.getHttpServer())
        .post("/api/v1/notifications/read-all")
        .set("Authorization", `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });

      const count = await request(app.getHttpServer())
        .get("/api/v1/notifications/unread-count")
        .set("Authorization", `Bearer ${token}`);
      expect(count.body.unreadCount).toBe(0);
    });
  });

  describe("GET /api/v1/notifications/unread-count", () => {
    it("T12: devuelve el conteo de no leidas", async () => {
      const token = await registerAndLogin("notif-count@example.com");
      const res = await request(app.getHttpServer())
        .get("/api/v1/notifications/unread-count")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.unreadCount).toBe(0);
    });
  });
});
