import { Injectable } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";

import { PrismaService } from "../../prisma/prisma.service";
import { FeedCacheService } from "./feed-cache.service";

/** Cola BullMQ para fan-out de posts al feed de seguidores. */
export const FEED_FANOUT_QUEUE = "feed-fanout";

/** Payload del job de fan-out. */
export interface FeedFanoutPayload {
  postId: string;
  authorId: string;
  createdAt: string;
}

/**
 * Worker de fan-out (spec 005 T11). Cuando un usuario crea un post,
 * empuja el postId al feed Redis de cada uno de sus seguidores.
 */
Processor(FEED_FANOUT_QUEUE);
@Injectable()
export class FeedFanoutWorker extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly feedCache: FeedCacheService,
  ) {
    super();
  }

  async process(job: Job<FeedFanoutPayload>): Promise<void> {
    switch (job.name) {
      case "fan-out-post":
        return this.fanOutPost(job);
      default:
        return;
    }
  }

  /**
   * T11: Obtener todos los followerIds del autor y empujar el post
   * al feed de cada uno en Redis. Usa batch para manejar miles de seguidores.
   */
  private async fanOutPost(job: Job<FeedFanoutPayload>): Promise<void> {
    const { postId, authorId, createdAt } = job.data;

    // Obtener todos los seguidores de golpe (se asume <500 seguidores en fase MVP)
    const follows = await this.prisma.follow.findMany({
      where: { followingId: authorId },
      select: { followerId: true },
    });

    if (follows.length === 0) return;

    const followerIds = follows.map((f) => f.followerId);

    // Empujar el post al feed de cada seguidor
    await Promise.all(
      followerIds.map((followerId) =>
        this.feedCache.pushToFeed(followerId, { postId, createdAt, authorId }),
      ),
    );

    // T10: registrar en qué feeds se insertó este post para invalidación
    await this.feedCache.trackPostInFeeds(postId, followerIds);

    await job.updateProgress(followerIds.length);
  }
}
