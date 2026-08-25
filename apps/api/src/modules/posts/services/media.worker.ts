import { Injectable } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { encode } from "blurhash";
import sharp from "sharp";
import type { Job } from "bullmq";

import { PrismaService } from "../../prisma/prisma.service";
import {
  POST_MEDIA_QUEUE,
  POST_THUMB_MAX_SIZE,
  type PostMediaProcessPayload,
} from "../posts.constants";
import { StorageService } from "./storage.service";

/**
 * Worker de procesamiento de imagenes de posts (spec 004 RF-2).
 * Genera thumbnail + blurhash y actualiza el registro post_media.
 */
@Processor(POST_MEDIA_QUEUE)
@Injectable()
export class MediaWorker extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {
    super();
  }

  async process(job: Job<PostMediaProcessPayload>): Promise<void> {
    switch (job.name) {
      case "post-media-process":
        return this.processPostMedia(job);
      default:
        return;
    }
  }

  /**
   * Descarga el original, genera thumbnail (max 1200px) y blurhash.
   * Si el objeto no aparece, termina sin error.
   */
  async processPostMedia(job: Job<PostMediaProcessPayload>): Promise<void> {
    const { mediaId, key } = job.data;

    if (!(await this.storage.exists(key))) {
      return;
    }

    const media = await this.prisma.postMedia.findUnique({ where: { id: mediaId } });
    if (!media) return;

    const original = await this.storage.download(key);
    const metadata = await sharp(original).metadata();

    // Thumbnail: resize manteniendo aspecto, max POST_THUMB_MAX_SIZE en el lado mas largo
    const thumb = await sharp(original)
      .rotate()
      .resize({
        width: POST_THUMB_MAX_SIZE,
        height: POST_THUMB_MAX_SIZE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer();

    // Blurhash
    const { data, info } = await sharp(thumb)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const blurhash = encode(new Uint8ClampedArray(data), info.width, info.height, 4, 3);

    const thumbKey = key.replace(/\.[a-z0-9]+$/i, ".thumb.webp");
    await this.storage.upload(thumbKey, thumb, "image/webp");

    await this.prisma.postMedia.update({
      where: { id: mediaId },
      data: {
        thumbKey,
        blurhash,
        width: metadata.width ?? null,
        height: metadata.height ?? null,
      },
    });
  }
}
