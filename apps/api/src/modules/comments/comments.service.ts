import {
  ForbiddenException,
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import type { CommentResponse, CommentsResponse, CreateCommentRequest } from "@redsocial/contracts";

import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";

/**
 * Servicio de comentarios (spec 006). Crear, listar, eliminar con contadores atomicos.
 * Spec 007/T14: al comentar se nota al autor del post (comment) y, en replies,
 * al autor del padre (reply) sin duplicados.
 */
@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * T11: Crear comentario. Transaccion atomica para incrementar contador.
   */
  async create(
    authorId: string,
    postId: string,
    dto: CreateCommentRequest,
  ): Promise<CommentResponse> {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, deletedAt: null },
      select: { id: true, authorId: true },
    });

    if (!post) {
      throw new NotFoundException("post_not_found");
    }

    // Si parentId esta presente, validar
    let parentAuthorId: string | undefined;
    if (dto.parentId) {
      const parentComment = await this.prisma.comment.findFirst({
        where: { id: dto.parentId, postId, deletedAt: null },
        select: { id: true, parentId: true, authorId: true },
      });

      if (!parentComment) {
        throw new NotFoundException("parent_comment_not_found");
      }

      // Solo se puede responder a comentarios de nivel 0
      if (parentComment.parentId !== null) {
        throw new BadRequestException("only_one_level_nesting_allowed");
      }
      parentAuthorId = parentComment.authorId;
    }

    // Transaccion atomica: crear comentario + incrementar contador
    const [comment] = await this.prisma.$transaction([
      this.prisma.comment.create({
        data: {
          postId,
          authorId,
          parentId: dto.parentId ?? null,
          text: dto.text,
        },
        include: {
          author: {
            select: {
              username: true,
              displayName: true,
              avatarThumbKey: true,
            },
          },
        },
      }),
      this.prisma.post.update({
        where: { id: postId },
        data: { commentsCount: { increment: 1 } },
      }),
    ]);

    // Spec 007/T14: notificar al autor del post (comment), post-commit.
    if (post.authorId !== authorId) {
      await this.notifications.create(post.authorId, {
        actorId: authorId,
        type: "comment",
        postId,
        commentId: comment.id,
      });
    }

    // Spec 007/T14: en replies, notificar al autor del padre (reply),
    // evitando duplicados con el autor del post o el propio actor.
    if (parentAuthorId && parentAuthorId !== authorId && parentAuthorId !== post.authorId) {
      await this.notifications.create(parentAuthorId, {
        actorId: authorId,
        type: "reply",
        postId,
        commentId: comment.id,
      });
    }

    return this.mapComment(comment, []);
  }

  /**
   * T11: Listar comentarios de nivel 0 paginados con replies.
   */
  async list(postId: string, limit: number, createdBefore?: string): Promise<CommentsResponse> {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, deletedAt: null },
      select: { id: true },
    });

    if (!post) {
      throw new NotFoundException("post_not_found");
    }

    // Obtener total de comentarios de nivel 0
    const total = await this.prisma.comment.count({
      where: {
        postId,
        parentId: null,
        deletedAt: null,
      },
    });

    // Obtener comentarios de nivel 0 paginados
    const comments = await this.prisma.comment.findMany({
      where: {
        postId,
        parentId: null,
        deletedAt: null,
        ...(createdBefore ? { createdAt: { lt: new Date(createdBefore) } } : {}),
      },
      include: {
        author: {
          select: {
            username: true,
            displayName: true,
            avatarThumbKey: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
      take: limit + 1, // Traer uno extra para saber si hay mas
    });

    const hasMore = comments.length > limit;
    const items = hasMore ? comments.slice(0, limit) : comments;

    // Para cada comentario, obtener sus respuestas (maximo 3)
    const itemsWithReplies = await Promise.all(
      items.map(async (comment) => {
        const replies = await this.prisma.comment.findMany({
          where: {
            parentId: comment.id,
            deletedAt: null,
          },
          include: {
            author: {
              select: {
                username: true,
                displayName: true,
                avatarThumbKey: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
          take: 3,
        });

        return this.mapComment(comment, replies);
      }),
    );

    // Cursor para la siguiente pagina
    const nextCursor = hasMore ? items[items.length - 1].createdAt.toISOString() : null;

    return {
      items: itemsWithReplies,
      nextCursor,
      total,
    };
  }

  /**
   * T11: Eliminar comentario. Solo el autor puede eliminar.
   */
  async remove(userId: string, postId: string, commentId: string): Promise<void> {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, deletedAt: null },
      select: { id: true },
    });

    if (!post) {
      throw new NotFoundException("post_not_found");
    }

    const comment = await this.prisma.comment.findFirst({
      where: { id: commentId, postId, deletedAt: null },
      select: { id: true, authorId: true },
    });

    if (!comment) {
      throw new NotFoundException("comment_not_found");
    }

    if (comment.authorId !== userId) {
      throw new ForbiddenException("not_comment_author");
    }

    // Eliminar comentario y decrementar contador
    await this.prisma.$transaction([
      this.prisma.comment.delete({
        where: { id: commentId },
      }),
      this.prisma.post.update({
        where: { id: postId },
        data: { commentsCount: { decrement: 1 } },
      }),
    ]);
  }

  /**
   * Mapear comentario de Prisma a CommentResponse.
   */
  private mapComment(
    comment: {
      id: string;
      postId: string;
      text: string;
      parentId: string | null;
      createdAt: Date;
      author: {
        username: string | null;
        displayName: string | null;
        avatarThumbKey: string | null;
      };
    },
    replies: Array<{
      id: string;
      postId: string;
      text: string;
      parentId: string | null;
      createdAt: Date;
      author: {
        username: string | null;
        displayName: string | null;
        avatarThumbKey: string | null;
      };
    }>,
  ): CommentResponse {
    return {
      id: comment.id,
      postId: comment.postId,
      author: {
        username: comment.author.username ?? "unknown",
        displayName: comment.author.displayName,
        avatarUrl: comment.author.avatarThumbKey
          ? `/api/v1/media/${comment.author.avatarThumbKey}`
          : null,
      },
      text: comment.text,
      parentId: comment.parentId,
      replies: replies.map((r) => this.mapComment(r, [])),
      createdAt: comment.createdAt.toISOString(),
    };
  }
}
