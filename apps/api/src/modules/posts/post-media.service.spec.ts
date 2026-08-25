import { describe, expect, it, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import type { Queue } from "bullmq";

import { PostMediaService } from "./services/post-media.service";
import { StorageService } from "./services/storage.service";
import { FakePrisma } from "../../testing/fake-prisma";
import type { PrismaService } from "../prisma/prisma.service";

function makeService(prisma: FakePrisma) {
  const storage = {
    presignPutUrl: vi.fn().mockResolvedValue("http://signed/put"),
  } as unknown as StorageService;
  const queueAdd = vi.fn().mockResolvedValue(undefined);
  const service = new PostMediaService(prisma as unknown as PrismaService, storage, {
    add: queueAdd,
  } as unknown as Queue);
  return { service, storage, queueAdd, prisma };
}

describe("PostMediaService", () => {
  describe("createPresignedUpload", () => {
    it("emite URL firmada con key correcta", async () => {
      const prisma = new FakePrisma();
      const user = await prisma.user.create({
        data: { email: "presign@test.com", username: "presign_user" },
      });
      const { service } = makeService(prisma);

      const result = await service.createPresignedUpload(user.id, "image/jpeg");

      expect(result.uploadUrl).toBe("http://signed/put");
      expect(result.key).toMatch(new RegExp(`^posts/${user.id}/[a-f0-9-]+\\.jpg$`));
      expect(result.expiresIn).toBe(900);
    });

    it("lanza 404 si el usuario no existe", async () => {
      const prisma = new FakePrisma();
      const { service } = makeService(prisma);

      await expect(service.createPresignedUpload("nonexistent", "image/png")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("lanza 404 si el usuario esta eliminado", async () => {
      const prisma = new FakePrisma();
      const user = await prisma.user.create({
        data: { email: "deleted@test.com", username: "deleted_user" },
      });
      user.deletedAt = new Date();
      const { service } = makeService(prisma);

      await expect(service.createPresignedUpload(user.id, "image/webp")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("genera extension correcta por content type", async () => {
      const prisma = new FakePrisma();
      const user = await prisma.user.create({
        data: { email: "ext@test.com", username: "ext_user" },
      });
      const { service } = makeService(prisma);

      const jpeg = await service.createPresignedUpload(user.id, "image/jpeg");
      expect(jpeg.key.endsWith(".jpg")).toBe(true);

      const png = await service.createPresignedUpload(user.id, "image/png");
      expect(png.key.endsWith(".png")).toBe(true);

      const webp = await service.createPresignedUpload(user.id, "image/webp");
      expect(webp.key.endsWith(".webp")).toBe(true);
    });
  });

  describe("registerMedia", () => {
    it("crea registro en postMedia y encola job", async () => {
      const prisma = new FakePrisma();
      const { service, queueAdd } = makeService(prisma);
      const post = await prisma.post.create({
        data: { authorId: "uid", text: "test" },
      });

      const mediaId = await service.registerMedia(post.id, "posts/uid/key.jpg", "image/jpeg", 0);

      expect(mediaId).toBeDefined();
      const row = prisma._postMediaRows.find((m) => m.id === mediaId);
      expect(row?.key).toBe("posts/uid/key.jpg");
      expect(row?.sortOrder).toBe(0);
      expect(queueAdd).toHaveBeenCalledTimes(1);
      expect(queueAdd.mock.calls[0][0]).toBe("post-media-process");
    });
  });
});
