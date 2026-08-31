import { VersioningType } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import fastifyCookie from "@fastify/cookie";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AppModule } from "../../app.module";
import { EmailService } from "../email/email.service";
import { PrismaService } from "../prisma/prisma.service";
import { FakePrisma } from "../../testing/fake-prisma";
import { LoginRateLimiterService } from "../auth/services/login-rate-limiter.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";

const PASSWORD = "contrasena-segura";

describe("Eventos WS de notificaciones (spec 007/T16)", () => {
  let app: NestFastifyApplication;
  const prisma = new FakePrisma();
  const limiter = new LoginRateLimiterService(null);
  const gateway = {
    emitNotificationNew: vi.fn(),
    emitUnreadCount: vi.fn(),
    emitPresenceChange: vi.fn(),
  };

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

  function userId(email: string): string {
    const row = prisma.users.find((u) => u.email === email);
    expect(row).toBeDefined();
    return row!.id;
  }

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
      .overrideProvider(RealtimeGateway)
      .useValue(gateway)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.register(fastifyCookie);
    app.setGlobalPrefix("api");
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    await register("auth.alice@example.com");
    await register("action.bob@example.com");
    await register("target.carol@example.com");
  });

  afterAll(async () => {
    await app.close();
  });

  it("like ajeno emite notification:new al autor con unreadCount=1", async () => {
    const aliceToken = await login("auth.alice@example.com");
    const bobToken = await login("action.bob@example.com");
    const aliceId = userId("auth.alice@example.com");
    const bobId = userId("action.bob@example.com");

    const postRes = await request(app.getHttpServer())
      .post("/api/v1/posts")
      .set("Authorization", `Bearer ${aliceToken}`)
      .send({ text: "Post para el like" });
    expect(postRes.status).toBe(201);

    const likeRes = await request(app.getHttpServer())
      .post(`/api/v1/posts/${postRes.body.id}/like`)
      .set("Authorization", `Bearer ${bobToken}`);
    expect(likeRes.status).toBe(200);

    expect(gateway.emitNotificationNew).toHaveBeenCalledWith(
      aliceId,
      expect.objectContaining({ type: "like", postId: postRes.body.id }),
      1,
    );
    expect(gateway.emitNotificationNew.mock.calls[0]?.[0]).toBe(aliceId);
    expect(gateway.emitNotificationNew.mock.calls[0]?.[1]).toMatchObject({
      actor: expect.objectContaining({ id: bobId }),
    });
  });

  it("comment ajeno emite notification:new al autor con unreadCount=2", async () => {
    const bobToken = await login("action.bob@example.com");
    const aliceId = userId("auth.alice@example.com");
    const bobId = userId("action.bob@example.com");
    const post = prisma.posts[0]!;

    const commentRes = await request(app.getHttpServer())
      .post(`/api/v1/posts/${post.id}/comments`)
      .set("Authorization", `Bearer ${bobToken}`)
      .send({ text: "Comentario con notificacion" });
    expect(commentRes.status).toBe(201);

    const last = gateway.emitNotificationNew.mock.calls.at(-1);
    expect(last?.[0]).toBe(aliceId);
    expect(last?.[1]).toMatchObject({
      type: "comment",
      postId: post.id,
      commentId: commentRes.body.id,
      actor: expect.objectContaining({ id: bobId }),
    });
    expect(last?.[2]).toBe(2);
  });

  it("follow a cuenta publica emite notification:new al seguido", async () => {
    const bobToken = await login("action.bob@example.com");
    const carolId = userId("target.carol@example.com");
    const bobId = userId("action.bob@example.com");

    const followRes = await request(app.getHttpServer())
      .post("/api/v1/users/target_carol/follow")
      .set("Authorization", `Bearer ${bobToken}`);
    expect(followRes.status).toBe(201);

    const last = gateway.emitNotificationNew.mock.calls.at(-1);
    expect(last?.[0]).toBe(carolId);
    expect(last?.[1]).toMatchObject({
      type: "follow",
      actor: expect.objectContaining({ id: bobId }),
    });
    expect(last?.[2]).toBe(1);
  });

  it("marcar leida emite notifications:unread con conteo decrementado", async () => {
    const aliceToken = await login("auth.alice@example.com");
    const aliceId = userId("auth.alice@example.com");

    const notifRes = await request(app.getHttpServer())
      .get(`/api/v1/notifications?limit=1`)
      .set("Authorization", `Bearer ${aliceToken}`);
    expect(notifRes.status).toBe(200);
    const id = notifRes.body.items[0].id as string;

    gateway.emitUnreadCount.mockClear();
    const readRes = await request(app.getHttpServer())
      .patch(`/api/v1/notifications/${id}/read`)
      .set("Authorization", `Bearer ${aliceToken}`);
    expect(readRes.status).toBe(200);

    expect(gateway.emitUnreadCount).toHaveBeenCalledWith(aliceId, 1);
  });
});
