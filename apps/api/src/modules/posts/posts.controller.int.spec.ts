import { VersioningType } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import fastifyCookie from "@fastify/cookie";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getQueueToken } from "@nestjs/bullmq";

import { AppModule } from "../../app.module";
import { EmailService } from "../email/email.service";
import { PrismaService } from "../prisma/prisma.service";
import { FakePrisma } from "../../testing/fake-prisma";
import { LoginRateLimiterService } from "../auth/services/login-rate-limiter.service";
import { POST_MEDIA_QUEUE } from "./posts.constants";

const PASSWORD = "contrasena-segura";

describe("Posts (integracion)", () => {
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
      .overrideProvider(getQueueToken(POST_MEDIA_QUEUE))
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
    await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password: PASSWORD });
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password: PASSWORD });
    return res.body.accessToken as string;
  }

  describe("POST /posts", () => {
    it("crea post con texto", async () => {
      const token = await registerAndLogin("post-create@example.com");
      const res = await request(app.getHttpServer())
        .post("/api/v1/posts")
        .set("Authorization", `Bearer ${token}`)
        .send({ text: "Mi primer post" });

      expect(res.status).toBe(201);
      expect(res.body.text).toBe("Mi primer post");
      expect(res.body.id).toBeDefined();
      expect(res.body.author.username).toBeDefined();
    });

    it("rechaza sin token", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/posts")
        .send({ text: "No auth" });
      expect(res.status).toBe(401);
    });

    it("rechaza mediaKeys ajenas (403)", async () => {
      const token = await registerAndLogin("post-forbidden@example.com");
      const res = await request(app.getHttpServer())
        .post("/api/v1/posts")
        .set("Authorization", `Bearer ${token}`)
        .send({ text: "Hack", mediaKeys: ["posts/other-user/img.jpg"] });
      expect(res.status).toBe(403);
    });
  });

  describe("GET /posts/:id", () => {
    it("retorna post existente", async () => {
      const token = await registerAndLogin("post-find@example.com");
      const created = await request(app.getHttpServer())
        .post("/api/v1/posts")
        .set("Authorization", `Bearer ${token}`)
        .send({ text: "Find me" });
      const id = created.body.id;

      const res = await request(app.getHttpServer()).get(`/api/v1/posts/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.text).toBe("Find me");
    });

    it("404 si no existe", async () => {
      const res = await request(app.getHttpServer()).get(
        "/api/v1/posts/00000000-0000-0000-0000-000000000000",
      );
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /posts/:id", () => {
    it("actualiza texto del propio post", async () => {
      const token = await registerAndLogin("post-edit@example.com");
      const created = await request(app.getHttpServer())
        .post("/api/v1/posts")
        .set("Authorization", `Bearer ${token}`)
        .send({ text: "Original" });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/posts/${created.body.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ text: "Editado" });

      expect(res.status).toBe(200);
      expect(res.body.text).toBe("Editado");
      expect(res.body.editedAt).not.toBeNull();
    });

    it("403 si edita post ajeno", async () => {
      const token1 = await registerAndLogin("post-owner@example.com");
      const token2 = await registerAndLogin("post-other@example.com");
      const created = await request(app.getHttpServer())
        .post("/api/v1/posts")
        .set("Authorization", `Bearer ${token1}`)
        .send({ text: "Dueño" });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/posts/${created.body.id}`)
        .set("Authorization", `Bearer ${token2}`)
        .send({ text: "Intruso" });

      expect(res.status).toBe(403);
    });
  });

  describe("DELETE /posts/:id", () => {
    it("elimina logico el propio post", async () => {
      const token = await registerAndLogin("post-delete@example.com");
      const created = await request(app.getHttpServer())
        .post("/api/v1/posts")
        .set("Authorization", `Bearer ${token}`)
        .send({ text: "Borrar" });

      const del = await request(app.getHttpServer())
        .delete(`/api/v1/posts/${created.body.id}`)
        .set("Authorization", `Bearer ${token}`);
      expect(del.status).toBe(204);

      const get = await request(app.getHttpServer()).get(`/api/v1/posts/${created.body.id}`);
      expect(get.status).toBe(404);
    });

    it("403 si borra post ajeno", async () => {
      const token1 = await registerAndLogin("post-del-owner@example.com");
      const token2 = await registerAndLogin("post-del-other@example.com");
      const created = await request(app.getHttpServer())
        .post("/api/v1/posts")
        .set("Authorization", `Bearer ${token1}`)
        .send({ text: "No borrar" });

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/posts/${created.body.id}`)
        .set("Authorization", `Bearer ${token2}`);
      expect(res.status).toBe(403);
    });
  });

  describe("GET /posts/user/:username", () => {
    it("retorna feed paginado", async () => {
      const token = await registerAndLogin("post-feed@example.com");
      await request(app.getHttpServer())
        .post("/api/v1/posts")
        .set("Authorization", `Bearer ${token}`)
        .send({ text: "Feed 1" });
      await request(app.getHttpServer())
        .post("/api/v1/posts")
        .set("Authorization", `Bearer ${token}`)
        .send({ text: "Feed 2" });

      const res = await request(app.getHttpServer()).get("/api/v1/posts/user/post_feed?limit=1");
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.nextCursor).not.toBeNull();
    });

    it("404 si el usuario no existe", async () => {
      const res = await request(app.getHttpServer()).get("/api/v1/posts/user/noexiste");
      expect(res.status).toBe(404);
    });
  });

  describe("POST /posts/media/presign", () => {
    it("emite URL firmada", async () => {
      const token = await registerAndLogin("post-presign@example.com");
      const res = await request(app.getHttpServer())
        .post("/api/v1/posts/media/presign")
        .set("Authorization", `Bearer ${token}`)
        .send({ contentType: "image/jpeg", sizeBytes: 1024 });

      expect(res.status).toBe(201);
      expect(res.body.uploadUrl).toBeDefined();
      expect(res.body.key).toMatch(/^posts\//);
      expect(res.body.expiresIn).toBe(900);
    });

    it("rechaza tipo invalido", async () => {
      const token = await registerAndLogin("post-presign-invalid@example.com");
      const res = await request(app.getHttpServer())
        .post("/api/v1/posts/media/presign")
        .set("Authorization", `Bearer ${token}`)
        .send({ contentType: "image/gif", sizeBytes: 100 });
      expect(res.status).toBe(400);
    });

    it("rechaza peso excesivo", async () => {
      const token = await registerAndLogin("post-presign-big@example.com");
      const res = await request(app.getHttpServer())
        .post("/api/v1/posts/media/presign")
        .set("Authorization", `Bearer ${token}`)
        .send({ contentType: "image/png", sizeBytes: 6 * 1024 * 1024 });
      expect(res.status).toBe(400);
    });
  });
});
