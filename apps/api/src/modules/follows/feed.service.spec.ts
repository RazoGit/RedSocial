import { describe, expect, it } from "vitest";

import { FeedService } from "./services/feed.service";
import { LikesService } from "../likes/likes.service";
import { FakePrisma } from "../../testing/fake-prisma";
import type { PrismaService } from "../prisma/prisma.service";

function makeService(prisma: FakePrisma) {
  const likesService = new LikesService(prisma as unknown as PrismaService);
  return new FeedService(prisma as unknown as PrismaService, null, likesService);
}

describe("FeedService", () => {
  describe("getFeed", () => {
    it("retorna feed vacío cuando no sigue a nadie", async () => {
      const prisma = new FakePrisma();
      const service = makeService(prisma);
      const alice = await prisma.user.create({
        data: { email: "alice@test.com", username: "alice" },
      });

      const result = await service.getFeed(alice.id, 20);

      expect(result.items).toHaveLength(0);
      expect(result.nextCursor).toBeNull();
    });

    it("retorna posts de usuarios seguidos ordenados por created_at DESC", async () => {
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

      // Alice sigue a Bob y Charlie
      await prisma.follow.create({
        data: { followerId: alice.id, followingId: bob.id },
      });
      await prisma.follow.create({
        data: { followerId: alice.id, followingId: charlie.id },
      });

      // Bob crea un post hace 2 horas
      const bobPost = await prisma.post.create({
        data: { authorId: bob.id, text: "Post de Bob" },
      });
      const bobPostRow = prisma.posts.find((p) => p.id === bobPost.id)!;
      bobPostRow.createdAt = new Date(Date.now() - 7200000);

      // Charlie crea un post hace 1 hora
      const charliePost = await prisma.post.create({
        data: { authorId: charlie.id, text: "Post de Charlie" },
      });
      const charliePostRow = prisma.posts.find((p) => p.id === charliePost.id)!;
      charliePostRow.createdAt = new Date(Date.now() - 3600000);

      const result = await service.getFeed(alice.id, 20);

      expect(result.items).toHaveLength(2);
      // Charlie (más reciente) primero
      expect(result.items[0].text).toBe("Post de Charlie");
      expect(result.items[1].text).toBe("Post de Bob");
      expect(result.nextCursor).toBeNull();
    });

    it("excluye posts de usuarios no seguidos", async () => {
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

      // Alice solo sigue a Bob
      await prisma.follow.create({
        data: { followerId: alice.id, followingId: bob.id },
      });

      await prisma.post.create({
        data: { authorId: bob.id, text: "Visible" },
      });
      await prisma.post.create({
        data: { authorId: charlie.id, text: "No visible" },
      });

      const result = await service.getFeed(alice.id, 20);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].text).toBe("Visible");
    });

    it("excluye posts eliminados", async () => {
      const prisma = new FakePrisma();
      const service = makeService(prisma);
      const alice = await prisma.user.create({
        data: { email: "alice@test.com", username: "alice" },
      });
      const bob = await prisma.user.create({
        data: { email: "bob@test.com", username: "bob" },
      });

      await prisma.follow.create({
        data: { followerId: alice.id, followingId: bob.id },
      });

      const post = await prisma.post.create({
        data: { authorId: bob.id, text: "Borrado" },
      });
      await prisma.post.create({
        data: { authorId: bob.id, text: "Visible" },
      });

      // Soft delete
      const postRow = prisma.posts.find((p) => p.id === post.id)!;
      postRow.deletedAt = new Date();

      const result = await service.getFeed(alice.id, 20);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].text).toBe("Visible");
    });

    it("paginación con cursor", async () => {
      const prisma = new FakePrisma();
      const service = makeService(prisma);
      const alice = await prisma.user.create({
        data: { email: "alice@test.com", username: "alice" },
      });
      const bob = await prisma.user.create({
        data: { email: "bob@test.com", username: "bob" },
      });

      await prisma.follow.create({
        data: { followerId: alice.id, followingId: bob.id },
      });

      // Crear 3 posts con timestamps distintos
      const p1 = await prisma.post.create({
        data: { authorId: bob.id, text: "Post 1" },
      });
      const p1Row = prisma.posts.find((p) => p.id === p1.id)!;
      p1Row.createdAt = new Date(Date.now() - 3000);

      const p2 = await prisma.post.create({
        data: { authorId: bob.id, text: "Post 2" },
      });
      const p2Row = prisma.posts.find((p) => p.id === p2.id)!;
      p2Row.createdAt = new Date(Date.now() - 2000);

      const p3 = await prisma.post.create({
        data: { authorId: bob.id, text: "Post 3" },
      });
      const p3Row = prisma.posts.find((p) => p.id === p3.id)!;
      p3Row.createdAt = new Date(Date.now() - 1000);

      const page1 = await service.getFeed(alice.id, 2);
      expect(page1.items).toHaveLength(2);
      expect(page1.nextCursor).not.toBeNull();

      const page2 = await service.getFeed(alice.id, 2, page1.nextCursor!);
      expect(page2.items).toHaveLength(1);
      expect(page2.items[0].text).toBe("Post 1");
      expect(page2.nextCursor).toBeNull();
    });
  });
});
