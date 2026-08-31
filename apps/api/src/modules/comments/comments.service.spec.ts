import { describe, expect, it } from "vitest";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { CommentsService } from "./comments.service";
import { FakePrisma } from "../../testing/fake-prisma";
import type { PrismaService } from "../prisma/prisma.service";

function makeService(prisma: FakePrisma) {
  return new CommentsService(prisma as unknown as PrismaService);
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
});
