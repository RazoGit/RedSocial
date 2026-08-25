import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";

import type { CreatePostRequest, PaginatedPostsResponse, PostResponse } from "@redsocial/contracts";

import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "./storage.service";
import { PostMediaService } from "./post-media.service";

/**
 * Servicio principal de posts (spec 004). Orquesta CRUD, validacion de
 * permisos y paginacion cursor-based.
 */
@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly postMedia: PostMediaService,
  ) {}

  /** T6: crear post con texto y opcionalmente mediaKeys. */
  async create(authorId: string, dto: CreatePostRequest): Promise<PostResponse> {
    const post = await this.prisma.post.create({
      data: {
        authorId,
        text: dto.text ?? null,
      },
      select: { id: true, createdAt: true },
    });

    const mediaItems: PostResponse["media"] = [];

    if (dto.mediaKeys && dto.mediaKeys.length > 0) {
      for (let i = 0; i < dto.mediaKeys.length; i++) {
        const mediaKey = dto.mediaKeys[i]!;
        // Verificar que la key pertenece al autor (prefijo posts/{userId}/)
        if (!mediaKey.startsWith(`posts/${authorId}/`)) {
          throw new ForbiddenException("media_key_not_owned");
        }

        await this.postMedia.registerMedia(post.id, mediaKey, "image/jpeg", i);
        mediaItems.push({
          key: mediaKey,
          thumbKey: null,
          blurhash: null,
          width: null,
          height: null,
          contentType: "image/jpeg",
        });
      }
    }

    const author = await this.prisma.user.findUniqueOrThrow({
      where: { id: authorId },
      select: { username: true, displayName: true, avatarThumbKey: true },
    });

    return {
      id: post.id,
      author: {
        username: author.username!,
        displayName: author.displayName,
        avatarUrl: author.avatarThumbKey ? `/avatars/${authorId}/thumb` : null,
      },
      text: dto.text ?? null,
      media: mediaItems,
      createdAt: post.createdAt.toISOString(),
      editedAt: null,
    };
  }

  /** T7: obtener post por ID. */
  async findById(postId: string, viewerId?: string): Promise<PostResponse> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: {
        author: {
          select: {
            username: true,
            displayName: true,
            avatarThumbKey: true,
            isPrivate: true,
            id: true,
          },
        },
        media: { orderBy: { sortOrder: "asc" } },
      },
    });

    if (!post || post.deletedAt !== null) {
      throw new NotFoundException("post_not_found");
    }

    // RF-7: post privado y consultante no es el dueño
    if (post.author.isPrivate && (!viewerId || viewerId !== post.authorId)) {
      throw new NotFoundException("post_not_found");
    }

    return {
      id: post.id,
      author: {
        username: post.author.username!,
        displayName: post.author.displayName,
        avatarUrl: post.author.avatarThumbKey ? `/avatars/${post.authorId}/thumb` : null,
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
      createdAt: post.createdAt.toISOString(),
      editedAt: post.editedAt?.toISOString() ?? null,
    };
  }

  /** T8: editar texto de post (solo autor). */
  async updateText(postId: string, authorId: string, text: string): Promise<PostResponse> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true, deletedAt: true },
    });

    if (!post || post.deletedAt !== null) {
      throw new NotFoundException("post_not_found");
    }

    if (post.authorId !== authorId) {
      throw new ForbiddenException("not_author");
    }

    await this.prisma.post.update({
      where: { id: postId },
      data: { text, editedAt: new Date() },
    });

    return this.findById(postId, authorId);
  }

  /** T9: borrado logico de post (solo autor). */
  async softDelete(postId: string, authorId: string): Promise<void> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true, deletedAt: true },
    });

    if (!post || post.deletedAt !== null) {
      throw new NotFoundException("post_not_found");
    }

    if (post.authorId !== authorId) {
      throw new ForbiddenException("not_author");
    }

    await this.prisma.post.update({
      where: { id: postId },
      data: { deletedAt: new Date() },
    });
  }

  /** T10: feed propio paginado cursor-based. */
  async findByAuthor(
    authorUsername: string,
    limit: number,
    createdBefore?: string,
  ): Promise<PaginatedPostsResponse> {
    const author = await this.prisma.user.findFirst({
      where: { username: authorUsername, deletedAt: null },
      select: { id: true, avatarThumbKey: true, displayName: true },
    });

    if (!author) {
      throw new NotFoundException("user_not_found");
    }

    const cursor = createdBefore ? new Date(createdBefore) : undefined;

    const posts = await this.prisma.post.findMany({
      where: {
        authorId: author.id,
        deletedAt: null,
        ...(cursor ? { createdAt: { lt: cursor } } : {}),
      },
      include: {
        media: { orderBy: { sortOrder: "asc" } },
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1, // +1 para detectar si hay mas paginas
    });

    const hasMore = posts.length > limit;
    const items = hasMore ? posts.slice(0, limit) : posts;

    const nextCursor =
      hasMore && items.length > 0 ? items[items.length - 1]!.createdAt.toISOString() : null;

    return {
      items: items.map((post) => ({
        id: post.id,
        author: {
          username: authorUsername,
          displayName: author.displayName,
          avatarUrl: author.avatarThumbKey ? `/avatars/${author.id}/thumb` : null,
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
        createdAt: post.createdAt.toISOString(),
        editedAt: post.editedAt?.toISOString() ?? null,
      })),
      nextCursor,
    };
  }
}
