import { describe, expect, it, vi } from "vitest";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { CommentsService } from "./comments.service";
import { FakePrisma } from "../../testing/fake-prisma";
import type { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";

function makeService(prisma: FakePrisma) {
  const notifications = new NotificationsService(
    prisma as unknown as PrismaService,
    {
      emitNotificationNew: vi.fn(),
      emitUnreadCount: vi.fn(),
    } as never,
  );
  return new CommentsService(prisma as unknown as PrismaService, notifications);
}

describe("CommentsService", () => {
  describe("T13: Prisma schema cascade", () => {
    it("Comment relation has onDelete: Cascade on Post", () => {
      const schema = readFileSync(join(__dirname, "../../../prisma/schema.prisma"), "utf-8");
      expect(schema).toMatch(/model Comment[\s\S]*?onDelete: Cascade/);
    });

    it("soft-deleted posts are excluded from comment queries", async () => {
      const prisma = new FakePrisma();
      const service = makeService(prisma);
      const alice = await prisma.user.create({
        data: { email: "alice@test.com", username: "alice" },
      });
      const post = await prisma.post.create({ data: { authorId: alice.id, text: "post" } });
      await service.create(alice.id, post.id, { text: "visible" });

      // Soft delete post on the actual row
      const postRow = prisma.posts.find((p) => p.id === post.id)!;
      postRow.deletedAt = new Date();

      await expect(service.list(post.id, 10)).rejects.toThrow(NotFoundException);
    });
  });
  describe("create", () => {
    it("crea un comentario y incrementa commentsCount", async () => {
      const prisma = new FakePrisma();
      const service = makeService(prisma);
      const alice = await prisma.user.create({
        data: { email: "alice@test.com", username: "alice" },
      });
      const post = await prisma.post.create({ data: { authorId: alice.id, text: "post" } });

      const result = await service.create(alice.id, post.id, { text: "comentario" });

      expect(result.text).toBe("comentario");
      expect(result.author.username).toBe("alice");
      expect(result.parentId).toBeNull();
      expect(result.replies).toEqual([]);
      expect(prisma.comments).toHaveLength(1);
      expect(prisma.posts[0].commentsCount).toBe(1);
    });

    it("crea un reply y incrementa commentsCount", async () => {
      const prisma = new FakePrisma();
      const service = makeService(prisma);
      const alice = await prisma.user.create({
        data: { email: "alice@test.com", username: "alice" },
      });
      const post = await prisma.post.create({ data: { authorId: alice.id, text: "post" } });

      const parent = await service.create(alice.id, post.id, { text: "padre" });
      const reply = await service.create(alice.id, post.id, {
        text: "hijo",
        parentId: parent.id,
      });

      expect(reply.parentId).toBe(parent.id);
      expect(prisma.posts[0].commentsCount).toBe(2);
    });

    it("lanza 404 si el post no existe", async () => {
      const prisma = new FakePrisma();
      const service = makeService(prisma);
      const alice = await prisma.user.create({
        data: { email: "alice@test.com", username: "alice" },
      });

      await expect(service.create(alice.id, "nonexistent", { text: "hola" })).rejects.toThrow(
        NotFoundException,
      );
    });

    it("lanza 404 si el parent no existe", async () => {
      const prisma = new FakePrisma();
      const service = makeService(prisma);
      const alice = await prisma.user.create({
        data: { email: "alice@test.com", username: "alice" },
      });
      const post = await prisma.post.create({ data: { authorId: alice.id, text: "post" } });

      await expect(
        service.create(alice.id, post.id, { text: "hola", parentId: "nonexistent" }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("list", () => {
    it("retorna comentarios raíz paginados con replies", async () => {
      const prisma = new FakePrisma();
      const service = makeService(prisma);
      const alice = await prisma.user.create({
        data: { email: "alice@test.com", username: "alice" },
      });
      const post = await prisma.post.create({ data: { authorId: alice.id, text: "post" } });

      const c1 = await service.create(alice.id, post.id, { text: "uno" });
      const c2 = await service.create(alice.id, post.id, { text: "dos" });
      await service.create(alice.id, post.id, { text: "reply", parentId: c1.id });

      const result = await service.list(post.id, 10);

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.items.some((c) => c.id === c2.id)).toBe(true);
    });

    it("lanza 404 si el post no existe", async () => {
      const prisma = new FakePrisma();
      const service = makeService(prisma);

      await expect(service.list("nonexistent", 10)).rejects.toThrow(NotFoundException);
    });
  });

  describe("remove", () => {
    it("borra lógicamente el comentario y decrementa commentsCount", async () => {
      const prisma = new FakePrisma();
      const service = makeService(prisma);
      const alice = await prisma.user.create({
        data: { email: "alice@test.com", username: "alice" },
      });
      const post = await prisma.post.create({ data: { authorId: alice.id, text: "post" } });

      const comment = await service.create(alice.id, post.id, { text: "hola" });
      await service.remove(alice.id, post.id, comment.id);

      expect(prisma.posts[0].commentsCount).toBe(0);
      expect(prisma.comments[0].deletedAt).not.toBeNull();
    });

    it("lanza 404 si el comentario no existe", async () => {
      const prisma = new FakePrisma();
      const service = makeService(prisma);
      const alice = await prisma.user.create({
        data: { email: "alice@test.com", username: "alice" },
      });
      const post = await prisma.post.create({ data: { authorId: alice.id, text: "post" } });

      await expect(service.remove(alice.id, post.id, "nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("lanza 403 si no es el autor", async () => {
      const prisma = new FakePrisma();
      const service = makeService(prisma);
      const alice = await prisma.user.create({
        data: { email: "alice@test.com", username: "alice" },
      });
      const bob = await prisma.user.create({
        data: { email: "bob@test.com", username: "bob" },
      });
      const post = await prisma.post.create({ data: { authorId: alice.id, text: "post" } });

      const comment = await service.create(alice.id, post.id, { text: "hola" });
      await expect(service.remove(bob.id, post.id, comment.id)).rejects.toThrow(ForbiddenException);
    });
  });

  describe("notificaciones (spec 007/T14)", () => {
    it("comment ajeno nota al autor del post con type=comment", async () => {
      const prisma = new FakePrisma();
      const service = makeService(prisma);
      const alice = await prisma.user.create({
        data: { email: "alice@test.com", username: "alice" },
      });
      const bob = await prisma.user.create({
        data: { email: "bob@test.com", username: "bob" },
      });
      const post = await prisma.post.create({ data: { authorId: alice.id, text: "post" } });

      const comment = await service.create(bob.id, post.id, { text: "hola" });

      expect(prisma.notifications).toHaveLength(1);
      const n = prisma.notifications[0];
      expect(n?.userId).toBe(alice.id);
      expect(n?.actorId).toBe(bob.id);
      expect(n?.type).toBe("comment");
      expect(n?.postId).toBe(post.id);
      expect(n?.commentId).toBe(comment.id);
    });

    it("reply nota al autor del padre con type=reply", async () => {
      const prisma = new FakePrisma();
      const service = makeService(prisma);
      const alice = await prisma.user.create({
        data: { email: "alice@test.com", username: "alice" },
      });
      const bob = await prisma.user.create({
        data: { email: "bob@test.com", username: "bob" },
      });
      const carol = await prisma.user.create({
        data: { email: "carol@test.com", username: "carol" },
      });
      const post = await prisma.post.create({ data: { authorId: alice.id, text: "post" } });

      const parent = await service.create(carol.id, post.id, { text: "padre" });
      const replyComment = await service.create(bob.id, post.id, {
        text: "hijo",
        parentId: parent.id,
      });

      // alice recibe "comment" (2) y carol "reply" (1)
      expect(prisma.notifications).toHaveLength(3);
      const reply = prisma.notifications.find((n) => n.type === "reply");
      expect(reply?.userId).toBe(carol.id);
      expect(reply?.actorId).toBe(bob.id);
      expect(reply?.commentId).toBe(replyComment.id);
      const comments = prisma.notifications.filter((n) => n.type === "comment");
      expect(comments).toHaveLength(2);
      expect(comments[0]?.userId).toBe(alice.id);
      expect(comments[1]?.userId).toBe(alice.id);
    });

    it("no duplica cuando autor del padre == autor del post", async () => {
      const prisma = new FakePrisma();
      const service = makeService(prisma);
      const alice = await prisma.user.create({
        data: { email: "alice@test.com", username: "alice" },
      });
      const bob = await prisma.user.create({
        data: { email: "bob@test.com", username: "bob" },
      });
      const post = await prisma.post.create({ data: { authorId: alice.id, text: "post" } });

      const parent = await service.create(alice.id, post.id, { text: "padre" });
      await service.create(bob.id, post.id, { text: "hijo", parentId: parent.id });

      // alice es autor del post y del padre => una sola notificacion (comment),
      // y el comentario del propio post no notifica.
      expect(prisma.notifications).toHaveLength(1);
      expect(prisma.notifications[0]?.userId).toBe(alice.id);
      expect(prisma.notifications[0]?.type).toBe("comment");
    });

    it("comentar el propio post no crea notificacion", async () => {
      const prisma = new FakePrisma();
      const service = makeService(prisma);
      const alice = await prisma.user.create({
        data: { email: "alice@test.com", username: "alice" },
      });
      const post = await prisma.post.create({ data: { authorId: alice.id, text: "post" } });

      await service.create(alice.id, post.id, { text: "propio" });

      expect(prisma.notifications).toHaveLength(0);
    });
  });
});
