import { describe, expect, it, vi } from "vitest";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { LikesService } from "./likes.service";
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
  return new LikesService(prisma as unknown as PrismaService, notifications);
}

describe("LikesService", () => {
  describe("T13: Prisma schema cascade", () => {
    it("Like relation has onDelete: Cascade on Post", () => {
      const schema = readFileSync(join(__dirname, "../../../prisma/schema.prisma"), "utf-8");
      expect(schema).toMatch(/model Like[\s\S]*?onDelete: Cascade/);
    });
  });

  describe("like", () => {
    it("like incrementa likesCount del post", async () => {
      const prisma = new FakePrisma();
      const service = makeService(prisma);
      const alice = await prisma.user.create({
        data: { email: "alice@test.com", username: "alice" },
      });
      const post = await prisma.post.create({ data: { authorId: alice.id, text: "hola" } });

      const result = await service.like(alice.id, post.id);

      expect(result.liked).toBe(true);
      expect(result.likesCount).toBe(1);
      expect(prisma.likes).toHaveLength(1);
    });

    it("lanza 404 si el post no existe", async () => {
      const prisma = new FakePrisma();
      const service = makeService(prisma);
      const alice = await prisma.user.create({
        data: { email: "alice@test.com", username: "alice" },
      });

      await expect(service.like(alice.id, "nonexistent")).rejects.toThrow(NotFoundException);
    });

    it("lanza 409 si ya dio like", async () => {
      const prisma = new FakePrisma();
      const service = makeService(prisma);
      const alice = await prisma.user.create({
        data: { email: "alice@test.com", username: "alice" },
      });
      const post = await prisma.post.create({ data: { authorId: alice.id, text: "hola" } });

      await service.like(alice.id, post.id);
      await expect(service.like(alice.id, post.id)).rejects.toThrow(ConflictException);
    });
  });

  describe("unlike", () => {
    it("unlike decrementa likesCount del post", async () => {
      const prisma = new FakePrisma();
      const service = makeService(prisma);
      const alice = await prisma.user.create({
        data: { email: "alice@test.com", username: "alice" },
      });
      const post = await prisma.post.create({ data: { authorId: alice.id, text: "hola" } });

      await service.like(alice.id, post.id);
      const result = await service.unlike(alice.id, post.id);

      expect(result.liked).toBe(false);
      expect(result.likesCount).toBe(0);
      expect(prisma.likes).toHaveLength(0);
    });

    it("lanza 404 si no dio like", async () => {
      const prisma = new FakePrisma();
      const service = makeService(prisma);
      const alice = await prisma.user.create({
        data: { email: "alice@test.com", username: "alice" },
      });
      const post = await prisma.post.create({ data: { authorId: alice.id, text: "hola" } });

      await expect(service.unlike(alice.id, post.id)).rejects.toThrow(NotFoundException);
    });
  });

  describe("isLiked", () => {
    it("retorna true si dio like", async () => {
      const prisma = new FakePrisma();
      const service = makeService(prisma);
      const alice = await prisma.user.create({
        data: { email: "alice@test.com", username: "alice" },
      });
      const post = await prisma.post.create({ data: { authorId: alice.id, text: "hola" } });

      await service.like(alice.id, post.id);
      expect(await service.isLiked(alice.id, post.id)).toBe(true);
    });

    it("retorna false si no dio like", async () => {
      const prisma = new FakePrisma();
      const service = makeService(prisma);
      const alice = await prisma.user.create({
        data: { email: "alice@test.com", username: "alice" },
      });
      const post = await prisma.post.create({ data: { authorId: alice.id, text: "hola" } });

      expect(await service.isLiked(alice.id, post.id)).toBe(false);
    });
  });

  describe("getLikedPostIds", () => {
    it("retorna IDs de posts que le gustan al usuario", async () => {
      const prisma = new FakePrisma();
      const service = makeService(prisma);
      const alice = await prisma.user.create({
        data: { email: "alice@test.com", username: "alice" },
      });
      const post1 = await prisma.post.create({ data: { authorId: alice.id, text: "uno" } });
      const post2 = await prisma.post.create({ data: { authorId: alice.id, text: "dos" } });

      await service.like(alice.id, post1.id);
      await service.like(alice.id, post2.id);

      const ids = await service.getLikedPostIds(alice.id, [post1.id, post2.id]);
      expect(ids).toContain(post1.id);
      expect(ids).toContain(post2.id);
      expect(ids).toHaveLength(2);
    });
  });

  describe("notificaciones (spec 007/T13)", () => {
    it("like ajeno crea Notification type=like para el autor", async () => {
      const prisma = new FakePrisma();
      const service = makeService(prisma);
      const alice = await prisma.user.create({
        data: { email: "alice@test.com", username: "alice" },
      });
      const bob = await prisma.user.create({
        data: { email: "bob@test.com", username: "bob" },
      });
      const post = await prisma.post.create({ data: { authorId: alice.id, text: "post" } });

      await service.like(bob.id, post.id);

      expect(prisma.notifications).toHaveLength(1);
      const n = prisma.notifications[0];
      expect(n?.userId).toBe(alice.id);
      expect(n?.actorId).toBe(bob.id);
      expect(n?.type).toBe("like");
      expect(n?.postId).toBe(post.id);
    });

    it("like propio no crea notificacion", async () => {
      const prisma = new FakePrisma();
      const service = makeService(prisma);
      const alice = await prisma.user.create({
        data: { email: "alice@test.com", username: "alice" },
      });
      const post = await prisma.post.create({ data: { authorId: alice.id, text: "post" } });

      await service.like(alice.id, post.id);

      expect(prisma.notifications).toHaveLength(0);
    });
  });
});
