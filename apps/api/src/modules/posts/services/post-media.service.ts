import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Queue } from "bullmq";

import type { PresignPostMediaRequest, PresignPostMediaResponse } from "@redsocial/contracts";

import { PrismaService } from "../../prisma/prisma.service";
import {
  POST_MEDIA_QUEUE,
  POST_PRESIGN_TTL_SECONDS,
  POST_MEDIA_JOB_ATTEMPTS,
  type PostMediaProcessPayload,
} from "../posts.constants";
import { StorageService } from "./storage.service";

const EXTENSION_BY_CONTENT_TYPE: Record<PresignPostMediaRequest["contentType"], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * RF-2: emite la URL PUT pre-firmada para imagen de post.
 * La validacion de tipo y peso vive en el contrato Zod; aqui solo orquestamos.
 */
@Injectable()
export class PostMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @InjectQueue(POST_MEDIA_QUEUE) private readonly queue: Queue<PostMediaProcessPayload>,
  ) {}

  async createPresignedUpload(
    userId: string,
    contentType: PresignPostMediaRequest["contentType"],
  ): Promise<PresignPostMediaResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, deletedAt: true },
    });
    if (!user || user.deletedAt !== null) {
      throw new NotFoundException("user_not_found");
    }

    const extension = EXTENSION_BY_CONTENT_TYPE[contentType];
    const key = `posts/${userId}/${randomUUID()}.${extension}`;
    const uploadUrl = await this.storage.presignPutUrl(key, contentType, POST_PRESIGN_TTL_SECONDS);

    return { uploadUrl, key, expiresIn: POST_PRESIGN_TTL_SECONDS };
  }

  /**
   * Registra la imagen en post_media y encola el job de procesamiento.
   * Se llama al crear el post, no al presignar.
   */
  async registerMedia(
    postId: string,
    mediaKey: string,
    contentType: string,
    sortOrder: number,
  ): Promise<string> {
    const media = await this.prisma.postMedia.create({
      data: {
        postId,
        key: mediaKey,
        contentType,
        sortOrder,
      },
      select: { id: true },
    });

    await this.queue.add(
      "post-media-process",
      { postId, mediaId: media.id, key: mediaKey },
      {
        attempts: POST_MEDIA_JOB_ATTEMPTS,
        backoff: { type: "fixed", delay: 5_000 },
        removeOnComplete: true,
        removeOnFail: { age: 24 * 3600 },
      },
    );

    return media.id;
  }
}
