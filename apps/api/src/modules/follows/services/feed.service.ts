import { Inject, Injectable, Optional } from "@nestjs/common";
import type { FeedResponse, PostResponse } from "@redsocial/contracts";

import { PrismaService } from "../../prisma/prisma.service";
import { LikesService } from "../../likes/likes.service";
import { FeedCacheService } from "./feed-cache.service";

/**
 * Servicio de feed principal (spec 005 RF-7). Consulta posts de usuarios
 * seguidos con paginación cursor-based. Usa Redis cache con fallback a PostgreSQL.
 */
@Injectable()
export class FeedService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(FeedCacheService) @Optional() private readonly cache: FeedCacheService | null,
    private readonly likesService: LikesService,
  ) {}

  /**
   * T8+T9: Feed cronológico de posts de usuarios seguidos.
   * Intenta leer de Redis; si está vacío o no disponible, consulta PostgreSQL.
   */
  async getFeed(userId: string, limit: number, createdBefore?: string): Promise<FeedResponse> {
    // T9: Intentar leer de Redis cache primero
    if (this.cache) {
      const cachedPostIds = await this.cache.getFeedPostIds(userId, limit, createdBefore);
      if (cachedPostIds.length > 0) {
        const posts = await this.prisma.post.findMany({
          where: { id: { in: cachedPostIds }, deletedAt: null },
          include: {
            author: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarThumbKey: true,
              },
            },
            media: { orderBy: { sortOrder: "asc" } },
          },
        });

        // Mantener el orden del cache (más reciente primero)
        const postMap = new Map(posts.map((p) => [p.id, p]));
        const orderedPosts = cachedPostIds
          .map((id) => postMap.get(id))
          .filter((p): p is NonNullable<typeof p> => p !== undefined);

        // Calcular nextCursor del último item del cache
        const lastItem = orderedPosts[orderedPosts.length - 1];
        const nextCursor =
          orderedPosts.length === limit && lastItem ? lastItem.createdAt.toISOString() : null;

        const likedPostIds = await this.likesService.getLikedPostIds(
          userId,
          orderedPosts.map((p) => p.id),
        );

        return {
          items: orderedPosts.map((post) => this.toPostResponse(post, likedPostIds.has(post.id))),
          nextCursor,
        };
      }
    }

    // Fallback: query PostgreSQL directamente
    return this.getFeedFromDb(userId, limit, createdBefore);
  }

  /**
   * Query directa a PostgreSQL para el feed.
   */
  private async getFeedFromDb(
    userId: string,
    limit: number,
    createdBefore?: string,
  ): Promise<FeedResponse> {
    const follows = await this.prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });

    const followingIds = follows.map((f) => f.followingId);

    if (followingIds.length === 0) {
      return { items: [], nextCursor: null };
    }

    const cursor = createdBefore ? new Date(createdBefore) : undefined;

    const posts = await this.prisma.post.findMany({
      where: {
        authorId: { in: followingIds },
        deletedAt: null,
        ...(cursor ? { createdAt: { lt: cursor } } : {}),
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarThumbKey: true,
          },
        },
        media: { orderBy: { sortOrder: "asc" } },
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
    });

    const hasMore = posts.length > limit;
    const items = hasMore ? posts.slice(0, limit) : posts;

    const nextCursor =
      hasMore && items.length > 0 ? items[items.length - 1]!.createdAt.toISOString() : null;

    const likedPostIds = await this.likesService.getLikedPostIds(
      userId,
      items.map((p) => p.id),
    );

    return {
      items: items.map((post) => this.toPostResponse(post, likedPostIds.has(post.id))),
      nextCursor,
    };
  }

  private toPostResponse(
    post: {
      id: string;
      text: string | null;
      editedAt: Date | null;
      createdAt: Date;
      likesCount: number;
      commentsCount: number;
      author: {
        id: string;
        username: string | null;
        displayName: string | null;
        avatarThumbKey: string | null;
      };
      media: {
        key: string;
        thumbKey: string | null;
        blurhash: string | null;
        width: number | null;
        height: number | null;
        contentType: string;
      }[];
    },
    isLiked: boolean,
  ): PostResponse {
    return {
      id: post.id,
      author: {
        username: post.author.username!,
        displayName: post.author.displayName,
        avatarUrl: post.author.avatarThumbKey ? `/avatars/${post.author.id}/thumb` : null,
      },
      text: post.text,
      media: post.media.map((m) => ({
        key: m.key,
        thumbKey: m.thumbKey,
        blurhash: m.blurhash,
        width: m.width,
        height: m.height,
        contentType: m.contentType,
      })),
      likesCount: post.likesCount,
      commentsCount: post.commentsCount,
      isLiked,
      createdAt: post.createdAt.toISOString(),
      editedAt: post.editedAt?.toISOString() ?? null,
    };
  }
}
