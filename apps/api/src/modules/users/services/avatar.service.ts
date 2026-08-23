import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Queue } from "bullmq";

import type { PresignAvatarRequest, PresignAvatarResponse } from "@redsocial/contracts";

import { PrismaService } from "../../prisma/prisma.service";
import {
  AVATAR_JOB_ATTEMPTS,
  AVATAR_PRESIGN_TTL_SECONDS,
  AVATAR_PROCESS_DELAY_MS,
  MEDIA_QUEUE,
  type MediaJobPayload,
} from "../users.constants";
import { StorageService } from "./storage.service";

const EXTENSION_BY_CONTENT_TYPE: Record<PresignAvatarRequest["contentType"], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * RF-4: emite la URL PUT pre-firmada y programa el procesamiento del avatar.
 * La validacion de tipo y peso vive en el contrato Zod; aqui solo orquestamos.
 */
@Injectable()
export class AvatarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @InjectQueue(MEDIA_QUEUE) private readonly queue: Queue<MediaJobPayload>,
  ) {}

  async createPresignedUpload(
    userId: string,
    contentType: PresignAvatarRequest["contentType"],
  ): Promise<PresignAvatarResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, deletedAt: true },
    });
    if (!user || user.deletedAt !== null) {
      throw new UnauthorizedException("user_not_found");
    }

    const extension = EXTENSION_BY_CONTENT_TYPE[contentType];
    const key = `avatars/${userId}/${randomUUID()}.${extension}`;
    const uploadUrl = await this.storage.presignPutUrl(
      key,
      contentType,
      AVATAR_PRESIGN_TTL_SECONDS,
    );

    await this.queue.add(
      "avatar-process",
      { userId, key },
      {
        delay: AVATAR_PROCESS_DELAY_MS,
        attempts: AVATAR_JOB_ATTEMPTS,
        backoff: { type: "fixed", delay: 5_000 },
        removeOnComplete: true,
        removeOnFail: { age: 24 * 3600 },
      },
    );

    return { uploadUrl, key, expiresIn: AVATAR_PRESIGN_TTL_SECONDS };
  }
}
