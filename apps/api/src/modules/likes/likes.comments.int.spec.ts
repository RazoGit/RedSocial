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

const PASSWORD = "contrasena-segura";

describe("Likes y Comentarios (integracion spec 006)", () => {
  let app: NestFastifyApplication;
  const prisma = new FakePrisma();
  const enqueueVerificationEmail = vi.fn().mockResolvedValue(undefined);
  const limiter = new LoginRateLimiterService(null);

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

  async function registerAndLogin(email: string): Promise<string> {
    await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password: PASSWORD });
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password: PASSWORD });
    return res.body.accessToken as string;
  }

  async function createPost(token: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post("/api/v1/posts")
      .set("Authorization", `Bearer ${token}`)
      .send({ text: "Post para interacciones" });
    return res.body.id as string;
  }

  describe("Likes", () => {
    it("T5: POST /posts/:id/like da like y retorna contador", async () => {
      const token = await registerAndLogin("like-ok@example.com");
      const postId = await createPost(token);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/posts/${postId}/like`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.liked).toBe(true);
      expect(res.body.likesCount).toBe(1);
    });

    it("T5: like duplicado responde 409", async () => {
      const token = await registerAndLogin("like-dup@example.com");
      const postId = await createPost(token);

      await request(app.getHttpServer())
        .post(`/api/v1/posts/${postId}/like`)
        .set("Authorization", `Bearer ${token}`);
      const res = await request(app.getHttpServer())
        .post(`/api/v1/posts/${postId}/like`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(409);
    });

    it("T5: post inexistente responde 404", async () => {
      const token = await registerAndLogin("like-404@example.com");
      const res = await request(app.getHttpServer())
        .post("/api/v1/posts/00000000-0000-0000-0000-000000000000/like")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it("T5: sin token responde 401", async () => {
      const token = await registerAndLogin("like-401@example.com");
      const postId = await createPost(token);

      const res = await request(app.getHttpServer()).post(`/api/v1/posts/${postId}/like`);
      expect(res.status).toBe(401);
    });

    it("T6: DELETE /posts/:id/like quita like y decrementa", async () => {
      const token = await registerAndLogin("unlike-ok@example.com");
      const postId = await createPost(token);

      await request(app.getHttpServer())
        .post(`/api/v1/posts/${postId}/like`)
        .set("Authorization", `Bearer ${token}`);
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/posts/${postId}/like`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.liked).toBe(false);
      expect(res.body.likesCount).toBe(0);
    });

    it("T6: unlike sin like previo responde 404", async () => {
      const token = await registerAndLogin("unlike-404@example.com");
      const postId = await createPost(token);

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/posts/${postId}/like`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it("T6: unlike sin token responde 401", async () => {
      const token = await registerAndLogin("unlike-401@example.com");
      const postId = await createPost(token);

      const res = await request(app.getHttpServer()).delete(`/api/v1/posts/${postId}/like`);
      expect(res.status).toBe(401);
    });
  });

  describe("Comentarios", () => {
    it("T8: POST /posts/:id/comments crea comentario 201", async () => {
      const token = await registerAndLogin("comment-create@example.com");
      const postId = await createPost(token);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/posts/${postId}/comments`)
        .set("Authorization", `Bearer ${token}`)
        .send({ text: "Mi primer comentario" });

      expect(res.status).toBe(201);
      expect(res.body.text).toBe("Mi primer comentario");
      expect(res.body.author.username).toBeDefined();
      expect(res.body.parentId).toBeNull();
    });

    it("T8: texto vacio responde 400", async () => {
      const token = await registerAndLogin("comment-empty@example.com");
      const postId = await createPost(token);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/posts/${postId}/comments`)
        .set("Authorization", `Bearer ${token}`)
        .send({ text: "   " });

      expect(res.status).toBe(400);
    });

    it("T8: reply de un reply responde 400", async () => {
      const token = await registerAndLogin("comment-nest@example.com");
      const postId = await createPost(token);

      const parent = await request(app.getHttpServer())
        .post(`/api/v1/posts/${postId}/comments`)
        .set("Authorization", `Bearer ${token}`)
        .send({ text: "padre" });

      const reply = await request(app.getHttpServer())
        .post(`/api/v1/posts/${postId}/comments`)
        .set("Authorization", `Bearer ${token}`)
        .send({ text: "hijo", parentId: parent.body.id });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/posts/${postId}/comments`)
        .set("Authorization", `Bearer ${token}`)
        .send({ text: "nieto", parentId: reply.body.id });

      expect(res.status).toBe(400);
    });

    it("T8: post inexistente responde 404", async () => {
      const token = await registerAndLogin("comment-404@example.com");
      const res = await request(app.getHttpServer())
        .post("/api/v1/posts/00000000-0000-0000-0000-000000000000/comments")
        .set("Authorization", `Bearer ${token}`)
        .send({ text: "hola" });

      expect(res.status).toBe(404);
    });

    it("T8: sin token responde 401", async () => {
      const token = await registerAndLogin("comment-401@example.com");
      const postId = await createPost(token);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/posts/${postId}/comments`)
        .send({ text: "sin token" });

      expect(res.status).toBe(401);
    });

    it("T9: GET /posts/:id/comments lista con replies y total", async () => {
      const token = await registerAndLogin("comment-list@example.com");
      const postId = await createPost(token);

      const c1 = await request(app.getHttpServer())
        .post(`/api/v1/posts/${postId}/comments`)
        .set("Authorization", `Bearer ${token}`)
        .send({ text: "uno" });
      await request(app.getHttpServer())
        .post(`/api/v1/posts/${postId}/comments`)
        .set("Authorization", `Bearer ${token}`)
        .send({ text: "respuesta", parentId: c1.body.id });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/posts/${postId}/comments`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].replies).toHaveLength(1);
      expect(res.body.nextCursor).toBeNull();
    });

    it("T9: paginacion devuelve menos items con cursor", async () => {
      const token = await registerAndLogin("comment-page@example.com");
      const postId = await createPost(token);

      for (let i = 0; i < 3; i++) {
        await request(app.getHttpServer())
          .post(`/api/v1/posts/${postId}/comments`)
          .set("Authorization", `Bearer ${token}`)
          .send({ text: `comentario ${i}` });
      }

      const res = await request(app.getHttpServer())
        .get(`/api/v1/posts/${postId}/comments?limit=2`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.total).toBe(3);
      expect(res.body.nextCursor).not.toBeNull();
    });

    it("T10: DELETE /posts/:id/comments/:commentId elimina el propio comentario", async () => {
      const token = await registerAndLogin("comment-del@example.com");
      const postId = await createPost(token);

      const created = await request(app.getHttpServer())
        .post(`/api/v1/posts/${postId}/comments`)
        .set("Authorization", `Bearer ${token}`)
        .send({ text: "borrame" });

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/posts/${postId}/comments/${created.body.id}`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
    });

    it("T10: eliminar comentario ajeno responde 403", async () => {
      const token1 = await registerAndLogin("comment-owner@example.com");
      const token2 = await registerAndLogin("comment-other@example.com");
      const postId = await createPost(token1);

      const created = await request(app.getHttpServer())
        .post(`/api/v1/posts/${postId}/comments`)
        .set("Authorization", `Bearer ${token1}`)
        .send({ text: "ajeno" });

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/posts/${postId}/comments/${created.body.id}`)
        .set("Authorization", `Bearer ${token2}`);

      expect(res.status).toBe(403);
    });

    it("T10: comentario inexistente responde 404", async () => {
      const token = await registerAndLogin("comment-del-404@example.com");
      const postId = await createPost(token);

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/posts/${postId}/comments/00000000-0000-0000-0000-000000000000`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it("T10: eliminar comentario sin token responde 401", async () => {
      const token = await registerAndLogin("comment-del-401@example.com");
      const postId = await createPost(token);
      const created = await request(app.getHttpServer())
        .post(`/api/v1/posts/${postId}/comments`)
        .set("Authorization", `Bearer ${token}`)
        .send({ text: "sin token" });

      const res = await request(app.getHttpServer()).delete(
        `/api/v1/posts/${postId}/comments/${created.body.id}`,
      );

      expect(res.status).toBe(401);
    });
  });
});
