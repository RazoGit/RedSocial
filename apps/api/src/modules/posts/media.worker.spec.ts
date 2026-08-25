import { describe, expect, it } from "vitest";
import sharp from "sharp";

import { MediaWorker } from "./services/media.worker";
import { StorageService } from "./services/storage.service";
import { FakePrisma } from "../../testing/fake-prisma";
import type { PrismaService } from "../prisma/prisma.service";
import type { Job } from "bullmq";

/** JPEG de prueba generado en el momento. */
async function fixtureJpeg(width = 640, height = 480): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 120, g: 80, b: 40 } },
  })
    .jpeg()
    .toBuffer();
}

function makeStorageFake(options: { objectExists?: boolean } = {}) {
  const uploads: { key: string; body: Buffer; contentType: string }[] = [];
  return {
    uploads,
    exists: async () => options.objectExists ?? true,
    download: async () => fixtureJpeg(),
    upload: async (key: string, body: Buffer, contentType: string) => {
      uploads.push({ key, body, contentType });
    },
  };
}

function jobOf(
  mediaId: string,
  key: string,
): Job<{ postId: string; mediaId: string; key: string }> {
  return {
    data: { postId: "pid", mediaId, key },
    name: "post-media-process",
  } as unknown as Job<{ postId: string; mediaId: string; key: string }>;
}

describe("MediaWorker post-media-process", () => {
  it("genera thumbnail WebP + blurhash y actualiza post_media", async () => {
    const prisma = new FakePrisma();
    const user = await prisma.user.create({
      data: { email: "worker@test.com", username: "worker_user" },
    });
    const post = await prisma.post.create({ data: { authorId: user.id, text: "test" } });
    const mediaRow = await prisma.postMedia.create({
      data: {
        postId: post.id,
        key: `posts/${user.id}/abc.jpg`,
        contentType: "image/jpeg",
        sortOrder: 0,
      },
    });

    const storage = makeStorageFake();
    const worker = new MediaWorker(
      prisma as unknown as PrismaService,
      storage as unknown as StorageService,
    );

    await worker.process(jobOf(mediaRow.id, `posts/${user.id}/abc.jpg`));

    expect(storage.uploads).toHaveLength(1);
    const upload = storage.uploads[0];
    expect(upload.key).toBe(`posts/${user.id}/abc.thumb.webp`);
    expect(upload.contentType).toBe("image/webp");

    const meta = await sharp(upload.body).metadata();
    expect(meta.format).toBe("webp");
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(1200);

    const updated = prisma._postMediaRows.find((m) => m.id === mediaRow.id);
    expect(updated?.thumbKey).toBe(upload.key);
    expect(updated?.blurhash).toMatch(/^[0-9a-zA-Z#$%*+,-.:;=?@[\]^_{|}~]+$/);
    expect(updated?.width).toBe(640);
    expect(updated?.height).toBe(480);
  });

  it("termina sin error si el objeto no existe en S3", async () => {
    const prisma = new FakePrisma();
    const user = await prisma.user.create({
      data: { email: "missing@test.com", username: "missing_user" },
    });
    const post = await prisma.post.create({ data: { authorId: user.id, text: "test" } });
    const mediaRow = await prisma.postMedia.create({
      data: {
        postId: post.id,
        key: `posts/${user.id}/nope.jpg`,
        contentType: "image/jpeg",
        sortOrder: 0,
      },
    });

    const storage = makeStorageFake({ objectExists: false });
    const worker = new MediaWorker(
      prisma as unknown as PrismaService,
      storage as unknown as StorageService,
    );

    await expect(
      worker.process(jobOf(mediaRow.id, `posts/${user.id}/nope.jpg`)),
    ).resolves.toBeUndefined();
    expect(storage.uploads).toHaveLength(0);
  });

  it("termina sin error si el registro postMedia no existe", async () => {
    const prisma = new FakePrisma();
    const storage = makeStorageFake();
    const worker = new MediaWorker(
      prisma as unknown as PrismaService,
      storage as unknown as StorageService,
    );

    await expect(worker.process(jobOf("fake-media-id", "posts/u/f.jpg"))).resolves.toBeUndefined();
    expect(storage.uploads).toHaveLength(0);
  });

  it("no ensancha imagenes pequenas (withoutEnlargement)", async () => {
    const prisma = new FakePrisma();
    const user = await prisma.user.create({
      data: { email: "small@test.com", username: "small_user" },
    });
    const post = await prisma.post.create({ data: { authorId: user.id, text: "tiny" } });
    const mediaRow = await prisma.postMedia.create({
      data: {
        postId: post.id,
        key: `posts/${user.id}/tiny.jpg`,
        contentType: "image/jpeg",
        sortOrder: 0,
      },
    });

    // Imagen de 100x100 — no debe agrandarse
    const tiny = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 50, g: 50, b: 50 } },
    })
      .jpeg()
      .toBuffer();

    const storage = {
      uploads: [] as { key: string; body: Buffer; contentType: string }[],
      exists: async () => true,
      download: async () => tiny,
      upload: async (key: string, body: Buffer, contentType: string) => {
        storage.uploads.push({ key, body, contentType });
      },
    };
    const worker = new MediaWorker(
      prisma as unknown as PrismaService,
      storage as unknown as StorageService,
    );

    await worker.process(jobOf(mediaRow.id, `posts/${user.id}/tiny.jpg`));

    const upload = storage.uploads[0];
    const meta = await sharp(upload.body).metadata();
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(100);
  });
});
