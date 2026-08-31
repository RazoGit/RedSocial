import { describe, expect, it, vi } from "vitest";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { Queue } from "bullmq";

import type { CreatePostRequest } from "@redsocial/contracts";

import { PostsService } from "./services/posts.service";
import { PostMediaService } from "./services/post-media.service";
import { StorageService } from "./services/storage.service";
import { LikesService } from "../likes/likes.service";
import { FakePrisma } from "../../testing/fake-prisma";
import type { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";

function makeService(prisma: FakePrisma) {
  const storage = { presignPutUrl: vi.fn() } as unknown as StorageService;
  const queueAdd = vi.fn().mockResolvedValue(undefined);
  const postMedia = new PostMediaService(prisma as unknown as PrismaService, storage, {
    add: queueAdd,
  } as unknown as Queue);
  const feedCache = { removePostFromFeeds: vi.fn().mockResolvedValue(undefined) };
  const fanoutQueue = { add: vi.fn().mockResolvedValue(undefined) };
  const notifications = new NotificationsService(
    prisma as unknown as PrismaService,
    {
      emitNotificationNew: vi.fn(),
      emitUnreadCount: vi.fn(),
    } as never,
  );
  const likesService = new LikesService(prisma as unknown as PrismaService, notifications);
  const service = new PostsService(
    prisma as unknown as PrismaService,
    storage,
    postMedia,
    feedCache as never,
    fanoutQueue as never,
    likesService,
  );
  return { service, storage, queueAdd, feedCache, fanoutQueue, prisma };
}

async function seedAuthor(prisma: FakePrisma) {
  return prisma.user.create({
    data: { email: "autor@test.com", username: "autor_test" },
  });
}

describe("PostsService", () => {
  describe("create", () => {
    it("crea post solo con texto", async () => {
      const prisma = new FakePrisma();
      const author = await seedAuthor(prisma);
      const { service } = makeService(prisma);

      const result = await service.create(author.id, { text: "Hola mundo" });

      expect(result.id).toBeDefined();
      expect(result.text).toBe("Hola mundo");
      expect(result.author.username).toBe("autor_test");
      expect(result.media).toHaveLength(0);
      expect(result.editedAt).toBeNull();
    });

    it("crea post sin texto lanza 422 via Zod (aqui solo probamos vacío)", async () => {
      const prisma = new FakePrisma();
      const author = await seedAuthor(prisma);
      const { service } = makeService(prisma);

      await expect(service.create(author.id, {} as CreatePostRequest)).resolves.toBeDefined(); // service no valida; Zod lo hace antes
    });

    it("rechaza mediaKeys que no pertenecen al autor", async () => {
      const prisma = new FakePrisma();
      const author = await seedAuthor(prisma);
      const { service } = makeService(prisma);

      await expect(
        service.create(author.id, {
          text: "Post",
          mediaKeys: ["posts/otro-user-id/abc.jpg"],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("acepta mediaKeys con prefijo correcto del autor", async () => {
      const prisma = new FakePrisma();
      const author = await seedAuthor(prisma);
      const { service, queueAdd } = makeService(prisma);

      const result = await service.create(author.id, {
        text: "Con imagen",
        mediaKeys: [`posts/${author.id}/img.jpg`],
      });

      expect(result.media).toHaveLength(1);
      expect(result.media[0].key).toBe(`posts/${author.id}/img.jpg`);
      expect(queueAdd).toHaveBeenCalledTimes(1);
    });
  });

  describe("findById", () => {
    it("retorna post publico existente", async () => {
      const prisma = new FakePrisma();
      const author = await seedAuthor(prisma);
      const { service } = makeService(prisma);
      const post = await service.create(author.id, { text: "Visible" });

      const found = await service.findById(post.id);
      expect(found.text).toBe("Visible");
      expect(found.author.username).toBe("autor_test");
    });

    it("lanza 404 si el post no existe", async () => {
      const prisma = new FakePrisma();
      const { service } = makeService(prisma);

      await expect(service.findById("nonexistent")).rejects.toThrow(NotFoundException);
    });

    it("lanza 404 si el post fue eliminado", async () => {
      const prisma = new FakePrisma();
      const author = await seedAuthor(prisma);
      const { service } = makeService(prisma);
      const post = await service.create(author.id, { text: "Borrado" });
      await service.softDelete(post.id, author.id);

      await expect(service.findById(post.id)).rejects.toThrow(NotFoundException);
    });

    it("lanza 404 para post privado ajeno", async () => {
      const prisma = new FakePrisma();
      const author = await seedAuthor(prisma);
      const other = await prisma.user.create({
        data: { email: "otro@test.com", username: "otro_user" },
      });
      // Hacer privado al autor
      author.isPrivate = true;
      const { service } = makeService(prisma);
      const post = await service.create(author.id, { text: "Privado" });

      await expect(service.findById(post.id, other.id)).rejects.toThrow(NotFoundException);
    });

    it("permite ver post privado al propio dueño", async () => {
      const prisma = new FakePrisma();
      const author = await seedAuthor(prisma);
      author.isPrivate = true;
      const { service } = makeService(prisma);
      const post = await service.create(author.id, { text: "Mi privado" });

      const found = await service.findById(post.id, author.id);
      expect(found.text).toBe("Mi privado");
    });
  });

  describe("updateText", () => {
    it("actualiza texto y setea editedAt", async () => {
      const prisma = new FakePrisma();
      const author = await seedAuthor(prisma);
      const { service } = makeService(prisma);
      const post = await service.create(author.id, { text: "Original" });

      const updated = await service.updateText(post.id, author.id, "Modificado");
      expect(updated.text).toBe("Modificado");
      expect(updated.editedAt).not.toBeNull();
    });

    it("lanza 403 si no es el autor", async () => {
      const prisma = new FakePrisma();
      const author = await seedAuthor(prisma);
      const other = await prisma.user.create({
        data: { email: "intruso@test.com", username: "intruso" },
      });
      const { service } = makeService(prisma);
      const post = await service.create(author.id, { text: "Ajeno" });

      await expect(service.updateText(post.id, other.id, "Hack")).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("lanza 404 si el post no existe", async () => {
      const prisma = new FakePrisma();
      const { service } = makeService(prisma);

      await expect(service.updateText("nope", "uid", "text")).rejects.toThrow(NotFoundException);
    });
  });

  describe("softDelete", () => {
    it("marca deletedAt", async () => {
      const prisma = new FakePrisma();
      const author = await seedAuthor(prisma);
      const { service } = makeService(prisma);
      const post = await service.create(author.id, { text: "Borrar" });

      await service.softDelete(post.id, author.id);
      const row = prisma.posts.find((p) => p.id === post.id);
      expect(row?.deletedAt).not.toBeNull();
    });

    it("lanza 403 si no es el autor", async () => {
      const prisma = new FakePrisma();
      const author = await seedAuthor(prisma);
      const other = await prisma.user.create({
        data: { email: "hacker@test.com", username: "hacker" },
      });
      const { service } = makeService(prisma);
      const post = await service.create(author.id, { text: "No borres" });

      await expect(service.softDelete(post.id, other.id)).rejects.toThrow(ForbiddenException);
    });

    it("lanza 404 si ya esta eliminado", async () => {
      const prisma = new FakePrisma();
      const author = await seedAuthor(prisma);
      const { service } = makeService(prisma);
      const post = await service.create(author.id, { text: "Doble" });

      await service.softDelete(post.id, author.id);
      await expect(service.softDelete(post.id, author.id)).rejects.toThrow(NotFoundException);
    });
  });

  describe("findByAuthor", () => {
    it("retorna posts paginados con cursor", async () => {
      const prisma = new FakePrisma();
      const author = await seedAuthor(prisma);
      const { service } = makeService(prisma);

      const p1 = await service.create(author.id, { text: "Post 1" }); // eslint-disable-line @typescript-eslint/no-unused-vars
      // Forzar timestamps distintos para cursor
      const post2Row = prisma.posts.find((p) => p.text === "Post 1")!;
      post2Row.createdAt = new Date(Date.now() - 2000);
      const p2 = await service.create(author.id, { text: "Post 2" }); // eslint-disable-line @typescript-eslint/no-unused-vars
      const post3Row = prisma.posts.find((p) => p.text === "Post 2")!;
      post3Row.createdAt = new Date(Date.now() - 1000);
      const p3 = await service.create(author.id, { text: "Post 3" }); // eslint-disable-line @typescript-eslint/no-unused-vars

      const page1 = await service.findByAuthor("autor_test", 2);
      expect(page1.items).toHaveLength(2);
      expect(page1.nextCursor).not.toBeNull();

      const page2 = await service.findByAuthor("autor_test", 2, page1.nextCursor!);
      expect(page2.items).toHaveLength(1);
      expect(page2.nextCursor).toBeNull();
    });

    it("lanza 404 si el usuario no existe", async () => {
      const prisma = new FakePrisma();
      const { service } = makeService(prisma);

      await expect(service.findByAuthor("noexiste", 10)).rejects.toThrow(NotFoundException);
    });

    it("excluye posts eliminados", async () => {
      const prisma = new FakePrisma();
      const author = await seedAuthor(prisma);
      const { service } = makeService(prisma);

      const post = await service.create(author.id, { text: "Visible" });
      await service.create(author.id, { text: "Otro" });
      await service.softDelete(post.id, author.id);

      const result = await service.findByAuthor("autor_test", 10);
      expect(result.items.every((p) => p.text !== "Visible")).toBe(true);
    });
  });
});
