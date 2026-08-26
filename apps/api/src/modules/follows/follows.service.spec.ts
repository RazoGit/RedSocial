import { describe, expect, it } from "vitest";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";

import { FollowsService } from "./services/follows.service";
import { FakePrisma } from "../../testing/fake-prisma";
import type { PrismaService } from "../prisma/prisma.service";

function makeService(prisma: FakePrisma) {
  return new FollowsService(prisma as unknown as PrismaService);
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
});
