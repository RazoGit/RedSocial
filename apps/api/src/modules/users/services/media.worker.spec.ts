import { describe, expect, it } from "vitest";
import sharp from "sharp";

import { PrismaService } from "../../prisma/prisma.service";
import { FakePrisma } from "../../../testing/fake-prisma";
import { MediaWorker } from "./media.worker";
import { ProfileCacheService } from "./profile-cache.service";
import type { StorageService } from "./storage.service";
import type { Job } from "bullmq";

/** Caché de perfiles en memoria (sin Redis): suficiente para los tests. */
function makeCacheFake(): ProfileCacheService & { invalidated: string[][] } {
  const invalidated: string[][] = [];
  const fake = {
    invalidated,
    get: async () => null,
    set: async (): Promise<void> => {},
    invalidate: async (...usernames: string[]): Promise<void> => {
      invalidated.push(usernames);
    },
  };
  return fake as unknown as ProfileCacheService & typeof fake;
}

/** JPEG de prueba generado en el momento (sin fixtures binarios). */
async function fixtureJpeg(): Promise<Buffer> {
  return sharp({
    create: {
      width: 640,
      height: 480,
      channels: 3,
      background: { r: 120, g: 80, b: 40 },
    },
  })
    .jpeg()
    .toBuffer();
}

interface StorageFakeOptions {
  objectExists?: boolean;
  downloadThrows?: boolean;
}

function makeStorageFake(options: StorageFakeOptions = {}): StorageService & {
  uploads: { key: string; body: Buffer; contentType: string }[];
  removed: string[];
} {
  const uploads: { key: string; body: Buffer; contentType: string }[] = [];
  const removed: string[] = [];
  const fake = {
    uploads,
    removed,
    presignPutUrl: async () => "http://signed/put",
    presignGetUrl: async () => "http://signed/get",
    upload: async (key: string, body: Buffer, contentType: string): Promise<void> => {
      uploads.push({ key, body, contentType });
    },
    download: async (): Promise<Buffer> => {
      if (options.downloadThrows) throw new Error("s3_down");
      return fixtureJpeg();
    },
    exists: async (): Promise<boolean> => options.objectExists ?? true,
    remove: async (key: string): Promise<void> => {
      removed.push(key);
    },
  };
  return fake as unknown as StorageService & typeof fake;
}

function jobOf(userId: string, key: string): Job<{ userId: string; key: string }> {
  return { data: { userId, key }, name: "avatar-process" } as unknown as Job<{
    userId: string;
    key: string;
  }>;
}

describe("MediaWorker avatar-process", () => {
  it("RF-4: genera thumbnail WebP 256px + blurhash y persiste referencias", async () => {
    const fakePrisma = new FakePrisma();
    const user = await fakePrisma.user.create({
      data: { email: "nora.worker@example.com", username: "nora_worker" },
    });
    const storage = makeStorageFake();
    const cache = makeCacheFake();
    const worker = new MediaWorker(fakePrisma as unknown as PrismaService, storage, cache);

    const originalKey = `avatars/${user.id}/abc.jpg`;
    await worker.process(jobOf(user.id, originalKey));

    expect(cache.invalidated).toEqual([["nora_worker"]]);

    expect(storage.uploads).toHaveLength(1);
    const upload = storage.uploads[0];
    expect(upload.key).toBe(`avatars/${user.id}/abc.thumb.webp`);
    expect(upload.contentType).toBe("image/webp");

    const meta = await sharp(upload.body).metadata();
    expect(meta.format).toBe("webp");
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(256);

    const after = fakePrisma.users.find((u) => u.id === user.id);
    expect(after?.avatarKey).toBe(originalKey);
    expect(after?.avatarThumbKey).toBe(upload.key);
    expect(after?.avatarBlurhash).toMatch(/^[0-9a-zA-Z#$%*+,-.:;=?@[\]^_{|}~]+$/);
    expect(after?.avatarBlurhash?.length).toBeGreaterThan(6);

    expect(storage.removed).toHaveLength(0);
  });

  it("termina sin error ni escrituras si el cliente nunca subio el original", async () => {
    const fakePrisma = new FakePrisma();
    const user = await fakePrisma.user.create({
      data: { email: "omar.vacio@example.com", username: "omar_vacio" },
    });
    const storage = makeStorageFake({ objectExists: false });
    const worker = new MediaWorker(
      fakePrisma as unknown as PrismaService,
      storage,
      makeCacheFake(),
    );

    await expect(
      worker.process(jobOf(user.id, `avatars/${user.id}/nope.jpg`)),
    ).resolves.toBeUndefined();

    expect(storage.uploads).toHaveLength(0);
    const row = fakePrisma.users.find((u) => u.id === user.id);
    expect(row?.avatarThumbKey).toBeNull();
  });

  it("elimina el thumbnail anterior cuando se procesa un avatar nuevo", async () => {
    const fakePrisma = new FakePrisma();
    const user = await fakePrisma.user.create({
      data: { email: "paula.reuse@example.com", username: "paula_reuse" },
    });
    user.avatarKey = `avatars/${user.id}/viejo.png`;
    user.avatarThumbKey = `avatars/${user.id}/viejo.thumb.webp`;

    const storage = makeStorageFake();
    const worker = new MediaWorker(
      fakePrisma as unknown as PrismaService,
      storage,
      makeCacheFake(),
    );

    await worker.process(jobOf(user.id, `avatars/${user.id}/nuevo.png`));

    expect(storage.removed).toEqual([`avatars/${user.id}/viejo.thumb.webp`]);
    const row = fakePrisma.users.find((u) => u.id === user.id);
    expect(row?.avatarThumbKey).toBe(`avatars/${user.id}/nuevo.thumb.webp`);
  });
});
