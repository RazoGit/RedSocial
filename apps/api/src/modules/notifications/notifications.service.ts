import { Injectable, NotFoundException } from "@nestjs/common";

import type {
  Notification as NotificationDto,
  NotificationActor,
  NotificationsQuery,
  NotificationsResponse,
  UnreadCountResponse,
} from "@redsocial/contracts";

import { PrismaService } from "../prisma/prisma.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";

export type NotificationTypeValue = "like" | "comment" | "reply" | "follow";

export interface CreateNotificationInput {
  actorId: string;
  type: NotificationTypeValue;
  postId?: string;
  commentId?: string;
}

interface ActorRow {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarThumbKey: string | null;
}

interface NotificationRow {
  id: string;
  userId: string;
  actorId: string;
  type: NotificationTypeValue;
  postId: string | null;
  commentId: string | null;
  readAt: Date | null;
  createdAt: Date;
  actor?: ActorRow;
}

const ACTOR_SELECT = {
  select: {
    id: true,
    username: true,
    displayName: true,
    avatarThumbKey: true,
  },
} as const;

function actorUrl(actor: ActorRow): string | null {
  return actor.avatarThumbKey ? `/avatars/${actor.id}/thumb` : null;
}

function toActor(actor: ActorRow | undefined): NotificationActor {
  if (!actor) {
    return { id: "", username: "usuario", displayName: null, avatarUrl: null };
  }
  return {
    id: actor.id,
    username: actor.username ?? "usuario",
    displayName: actor.displayName,
    avatarUrl: actorUrl(actor),
  };
}

function toDto(row: NotificationRow): NotificationDto {
  return {
    id: row.id,
    type: row.type,
    actor: toActor(row.actor),
    postId: row.postId,
    commentId: row.commentId,
    read: row.readAt !== null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Notificaciones (spec 007). Persistencia en PostgreSQL + emision WS
 * no-bloqueante tras el commit de la accion (RF-11).
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** RF-2/3/4: persiste y emite. No se notifica a uno mismo. */
  async create(receiverId: string, input: CreateNotificationInput): Promise<void> {
    if (!receiverId || receiverId === input.actorId) return;

    const unreadCount = await this.prisma.notification.count({
      where: { userId: receiverId, readAt: null },
    });

    const row = await this.prisma.notification.create({
      data: {
        userId: receiverId,
        actorId: input.actorId,
        type: input.type,
        ...(input.postId !== undefined && { postId: input.postId }),
        ...(input.commentId !== undefined && { commentId: input.commentId }),
      },
    });

    // RF-11: la emision WS nunca debe romper la accion REST.
    try {
      const actor = await this.prisma.user.findUnique({
        where: { id: input.actorId },
        select: { id: true, username: true, displayName: true, avatarThumbKey: true },
      });
      if (actor) {
        const dto = toDto({ ...row, actor } as NotificationRow);
        this.realtime.emitNotificationNew(receiverId, dto, unreadCount + 1);
      }
    } catch {
      // La notificacion queda persistida; el badge se sincroniza luego.
    }
  }

  /** RF-5: lista paginada cursor-based + unreadCount. */
  async findMany(userId: string, query: NotificationsQuery): Promise<NotificationsResponse> {
    const { limit, createdBefore } = query;
    const rows = (await this.prisma.notification.findMany({
      where: {
        userId,
        ...(createdBefore !== undefined && { createdAt: { lt: new Date(createdBefore) } }),
      },
      include: { actor: ACTOR_SELECT },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
    })) as unknown as NotificationRow[];

    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    const last = slice[slice.length - 1];

    const unreadCount = await this.prisma.notification.count({
      where: { userId, readAt: null },
    });

    return {
      items: slice.map(toDto),
      nextCursor: hasMore && last ? last.createdAt.toISOString() : null,
      unreadCount,
    };
  }

  /** RF-6: marcar una notificacion como leida (solo dueno). */
  async markRead(userId: string, id: string): Promise<{ id: string; read: true }> {
    const row = await this.prisma.notification.findUnique({ where: { id } });
    if (!row || row.userId !== userId) {
      throw new NotFoundException("notificacion_no_encontrada");
    }
    if (row.readAt === null) {
      await this.prisma.notification.updateMany({
        where: { id, userId, readAt: null },
        data: { readAt: new Date() },
      });
    }
    const unreadCount = await this.prisma.notification.count({
      where: { userId, readAt: null },
    });
    this.realtime.emitUnreadCount(userId, unreadCount);
    return { id, read: true };
  }

  /** RF-6: marcar todas como leidas (o un subconjunto opcional). */
  async markAllRead(userId: string, ids?: string[]): Promise<{ ok: true }> {
    await this.prisma.notification.updateMany({
      where: {
        userId,
        readAt: null,
        ...(ids !== undefined && ids.length > 0 && { id: { in: ids } }),
      },
      data: { readAt: new Date() },
    });
    const unreadCount = await this.prisma.notification.count({
      where: { userId, readAt: null },
    });
    this.realtime.emitUnreadCount(userId, unreadCount);
    return { ok: true };
  }

  /** RF-7/RF-10: conteo de no leidas (fallback sin WS). */
  async unreadCount(userId: string): Promise<UnreadCountResponse> {
    const unreadCount = await this.prisma.notification.count({
      where: { userId, readAt: null },
    });
    return { unreadCount };
  }
}
