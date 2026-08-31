import { describe, expect, it, vi } from "vitest";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";

import { FollowsService } from "./services/follows.service";
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
  return new FollowsService(prisma as unknown as PrismaService, notifications);
}

describe("FollowsService", () => {
  describe("follow", () => {
    it("follow exitoso incrementa contadores", async () => {
      const prisma = new FakePrisma();
      const service = makeService(prisma);
      const alice = await prisma.user.create({
        data: { email: "alice@test.com", username: "alice" },
      });
      const bob = await prisma.user.create({
        data: { email: "bob@test.com", username: "bob" },
      });

      const result = await service.follow(alice.id, "bob");

      expect(result.following).toBe(true);
      expect(result.followersCount).toBe(1);
      expect(result.followingCount).toBe(1);
      expect(prisma.follows).toHaveLength(1);
      expect(prisma.follows[0].followerId).toBe(alice.id);
      expect(prisma.follows[0].followingId).toBe(bob.id);
    });

    it("no puede seguirse a sí mismo", async () => {
      const prisma = new FakePrisma();
      const service = makeService(prisma);
      const alice = await prisma.user.create({
        data: { email: "alice@test.com", username: "alice" },
      });

      await expect(service.follow(alice.id, "alice")).rejects.toThrow(BadRequestException);
    });

    it("lanza 404 si el usuario no existe", async () => {
      const prisma = new FakePrisma();
      const service = makeService(prisma);
      const alice = await prisma.user.create({
        data: { email: "alice@test.com", username: "alice" },
      });

      await expect(service.follow(alice.id, "noexiste")).rejects.toThrow(NotFoundException);
    });

    it("lanza 409 si ya sigue al usuario", async () => {
      const prisma = new FakePrisma();
      const service = makeService(prisma);
      const alice = await prisma.user.create({
        data: { email: "alice@test.com", username: "alice" },
      });
      await prisma.user.create({
        data: { email: "bob@test.com", username: "bob" },
      });

      await service.follow(alice.id, "bob");
      await expect(service.follow(alice.id, "bob")).rejects.toThrow(ConflictException);
    });
  });

  describe("unfollow", () => {
    it("unfollow exitoso decrementa contadores", async () => {
      const prisma = new FakePrisma();
      const service = makeService(prisma);
      const alice = await prisma.user.create({
        data: { email: "alice@test.com", username: "alice" },
      });
      await prisma.user.create({
        data: { email: "bob@test.com", username: "bob" },
      });

      await service.follow(alice.id, "bob");
      const result = await service.unfollow(alice.id, "bob");

      expect(result.following).toBe(false);
      expect(result.followersCount).toBe(0);
      expect(result.followingCount).toBe(0);
      expect(prisma.follows).toHaveLength(0);
    });

    it("lanza 404 si no lo sigue", async () => {
      const prisma = new FakePrisma();
      const service = makeService(prisma);
      const alice = await prisma.user.create({
        data: { email: "alice@test.com", username: "alice" },
      });
      await prisma.user.create({
        data: { email: "bob@test.com", username: "bob" },
      });

      await expect(service.unfollow(alice.id, "bob")).rejects.toThrow(NotFoundException);
    });

    it("lanza 404 si el usuario no existe", async () => {
      const prisma = new FakePrisma();
      const service = makeService(prisma);
      const alice = await prisma.user.create({
        data: { email: "alice@test.com", username: "alice" },
      });

      await expect(service.unfollow(alice.id, "noexiste")).rejects.toThrow(NotFoundException);
    });
  });

  describe("isFollowing", () => {
    it("retorna true si sigue al usuario", async () => {
      const prisma = new FakePrisma();
      const service = makeService(prisma);
      const alice = await prisma.user.create({
        data: { email: "alice@test.com", username: "alice" },
      });
      const bob = await prisma.user.create({
        data: { email: "bob@test.com", username: "bob" },
      });

      await service.follow(alice.id, "bob");
      expect(await service.isFollowing(alice.id, bob.id)).toBe(true);
    });

    it("retorna false si no sigue al usuario", async () => {
      const prisma = new FakePrisma();
      const service = makeService(prisma);
      const alice = await prisma.user.create({
        data: { email: "alice@test.com", username: "alice" },
      });
      const bob = await prisma.user.create({
        data: { email: "bob@test.com", username: "bob" },
      });

      expect(await service.isFollowing(alice.id, bob.id)).toBe(false);
    });
  });

  describe("getFollowerIds", () => {
    it("retorna IDs de seguidores", async () => {
      const prisma = new FakePrisma();
      const service = makeService(prisma);
      const alice = await prisma.user.create({
        data: { email: "alice@test.com", username: "alice" },
      });
      const bob = await prisma.user.create({
        data: { email: "bob@test.com", username: "bob" },
      });
      const charlie = await prisma.user.create({
        data: { email: "charlie@test.com", username: "charlie" },
      });

      await service.follow(bob.id, "alice");
      await service.follow(charlie.id, "alice");

      const followerIds = await service.getFollowerIds(alice.id);
      expect(followerIds).toContain(bob.id);
      expect(followerIds).toContain(charlie.id);
      expect(followerIds).toHaveLength(2);
    });
  });

  describe("notificaciones (spec 007/T15)", () => {
    it("follow a cuenta publica crea Notification type=follow", async () => {
      const prisma = new FakePrisma();
      const service = makeService(prisma);
      const alice = await prisma.user.create({
        data: { email: "alice@test.com", username: "alice" },
      });
      const bob = await prisma.user.create({
        data: { email: "bob@test.com", username: "bob" },
      });

      await service.follow(alice.id, "bob");

      expect(prisma.notifications).toHaveLength(1);
      const n = prisma.notifications[0];
      expect(n?.userId).toBe(bob.id);
      expect(n?.actorId).toBe(alice.id);
      expect(n?.type).toBe("follow");
    });

    it("follow a cuenta privada no crea notificacion", async () => {
      const prisma = new FakePrisma();
      const service = makeService(prisma);
      const alice = await prisma.user.create({
        data: { email: "alice@test.com", username: "alice" },
      });
      await prisma.user.create({
        data: { email: "bob@test.com", username: "bob", isPrivate: true },
      });

      await service.follow(alice.id, "bob");

      expect(prisma.notifications).toHaveLength(0);
    });

    it("self-follow no crea notificacion", async () => {
      const prisma = new FakePrisma();
      const service = makeService(prisma);
      const alice = await prisma.user.create({
        data: { email: "alice@test.com", username: "alice" },
      });

      await service.follow(alice.id, "alice").catch(() => {});

      expect(prisma.notifications).toHaveLength(0);
    });
  });
});
