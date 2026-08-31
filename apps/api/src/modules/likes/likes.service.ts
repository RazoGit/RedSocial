import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { LikeResponse } from "@redsocial/contracts";

import { PrismaService } from "../prisma/prisma.service";

/**
 * Servicio de likes (spec 006). Like/unlike con contadores atomicos.
 */
@Injectable()
export class LikesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * T7: Dar like a un post. Transaccion atomica para incrementar contador.
   */
  async like(userId: string, postId: string): Promise<LikeResponse> {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, deletedAt: null },
      select: { id: true },
    });

    if (!post) {
      throw new NotFoundException("post_not_found");
    }

    const existing = await this.prisma.like.findUnique({
      where: { userId_postId: { userId, postId } },
    });

    if (existing) {
      throw new ConflictException("already_liked");
    }

    // Transaccion atomica: insert like + incrementar contador
    await this.prisma.$transaction([
      this.prisma.like.create({
        data: { userId, postId },
      }),
      this.prisma.post.update({
        where: { id: postId },
        data: { likesCount: { increment: 1 } },
      }),
    ]);

    const updatedPost = await this.prisma.post.findUniqueOrThrow({
      where: { id: postId },
      select: { likesCount: true },
    });

    return {
      liked: true,
      likesCount: updatedPost.likesCount,
    };
  }

  /**
   * T7: Quitar like. Transaccion atomica para decrementar contador.
   */
  async unlike(userId: string, postId: string): Promise<LikeResponse> {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, deletedAt: null },
      select: { id: true },
    });

    if (!post) {
      throw new NotFoundException("post_not_found");
    }

    const existing = await this.prisma.like.findUnique({
      where: { userId_postId: { userId, postId } },
    });

    if (!existing) {
      throw new NotFoundException("not_liked");
    }

    // Transaccion atomica: delete like + decrementar contador
    await this.prisma.$transaction([
      this.prisma.like.delete({
        where: { userId_postId: { userId, postId } },
      }),
      this.prisma.post.update({
        where: { id: postId },
        data: { likesCount: { decrement: 1 } },
      }),
    ]);

    const updatedPost = await this.prisma.post.findUniqueOrThrow({
      where: { id: postId },
      select: { likesCount: true },
    });

    return {
      liked: false,
      likesCount: updatedPost.likesCount,
    };
  }

  /**
   * Verificar si un usuario dio like a un post. Usado por el endpoint de posts.
   */
  async isLiked(userId: string, postId: string): Promise<boolean> {
    const like = await this.prisma.like.findUnique({
      where: { userId_postId: { userId, postId } },
    });
    return like !== null;
  }

  /**
   * Verificar si un usuario dio like a multiples posts. Usado para el feed.
   */
  async getLikedPostIds(userId: string, postIds: string[]): Promise<Set<string>> {
    if (postIds.length === 0) return new Set();

    const likes = await this.prisma.like.findMany({
      where: { userId, postId: { in: postIds } },
      select: { postId: true },
    });

    return new Set(likes.map((l) => l.postId));
  }
}
