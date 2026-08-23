import { Injectable } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { encode } from "blurhash";
import sharp from "sharp";
import type { Job } from "bullmq";

import { PrismaService } from "../../prisma/prisma.service";
import { ProfileCacheService } from "./profile-cache.service";
import { AVATAR_THUMB_SIZE, MEDIA_QUEUE, type MediaJobPayload } from "../users.constants";
import { StorageService } from "./storage.service";

/**
 * Worker inline temporal (patron EmailWorker, spec 001 §9): consume la cola
 * `media` dentro del proceso API en dev. RF-4: descarga el original del
 * avatar, genera thumbnail WebP 256px + blurhash y persiste las referencias.
 */
@Processor(MEDIA_QUEUE)
@Injectable()
export class MediaWorker extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly profileCache: ProfileCacheService,
  ) {
    super();
  }

  async process(job: Job<MediaJobPayload>): Promise<void> {
    switch (job.name) {
      case "avatar-process":
        return this.processAvatar(job);
      default:
        return;
    }
  }

  /**
   * Si el objeto original nunca aparecio (cliente no subio), termina sin
   * error: no tiene sentido reintentar. Fallos reales de S3/sharp si se
   * reintentan segun la configuracion del job.
   */
  async processAvatar(job: Job<MediaJobPayload>): Promise<void> {
    const { userId, key } = job.data;

    if (!(await this.storage.exists(key))) {
      return;
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt !== null) {
      return;
    }

    const original = await this.storage.download(key);
    const thumb = await sharp(original)
      .rotate()
      .resize(AVATAR_THUMB_SIZE, AVATAR_THUMB_SIZE, { fit: "cover" })
      .webp({ quality: 82 })
      .toBuffer();

    const { data, info } = await sharp(thumb)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const blurhash = encode(new Uint8ClampedArray(data), info.width, info.height, 4, 3);

    const thumbKey = key.replace(/\.[a-z0-9]+$/i, ".thumb.webp");
    await this.storage.upload(thumbKey, thumb, "image/webp");

    // Snapshot previo al update: la fila puede ser la misma instancia.
    const previousThumbKey = user.avatarThumbKey;
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarKey: key, avatarThumbKey: thumbKey, avatarBlurhash: blurhash },
    });

    // El perfil publico cambio (avatar): invalida su caché.
    if (user.username) {
      await this.profileCache.invalidate(user.username);
    }

    // Limpieza del thumbnail anterior para no acumular basura en el bucket.
    if (previousThumbKey !== null && previousThumbKey !== thumbKey) {
      try {
        await this.storage.remove(previousThumbKey);
      } catch {
        // No bloquea el resultado por un fallo de limpieza.
      }
    }
  }
}
