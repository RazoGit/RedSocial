import { Injectable, Logger } from "@nestjs/common";
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";

import type { Notification } from "@redsocial/contracts";

import { TokensService } from "../auth/tokens.service";
import { PrismaService } from "../prisma/prisma.service";
import { PresenceService } from "../presence/presence.service";

export interface AuthenticatedSocketData {
  userId: string;
  email?: string;
}

interface PresenceWatchBody {
  userIds: string[];
}

const MAX_WATCH_IDS = 100;

/** Room personal por usuario, derivada del token (nunca del cliente). */
export function userRoom(userId: string): string {
  return `user:${userId}`;
}

export function presenceRoom(userId: string): string {
  return `presence:${userId}`;
}

/**
 * Gateway Socket.IO v1 (spec 007). Handshake autenticado con access token
 * JWT (RF-1), rooms por usuario, presence basica y emision de notificaciones.
 */
@WebSocketGateway({
  path: "/socket.io",
  cors: { origin: true, credentials: true },
})
@Injectable()
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);
  private server: Server | null = null;

  constructor(
    private readonly tokens: TokensService,
    private readonly presence: PresenceService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit(server: Server): void {
    this.server = server;
    server.use(async (socket, next) => {
      const token = socket.handshake.auth?.token;
      if (typeof token !== "string" || token.length === 0) {
        next(new Error("unauthorized"));
        return;
      }
      try {
        const payload = await this.tokens.verifyAccessToken(token);
        socket.data.userId = payload.sub;
        socket.data.email = payload.email;
        next();
      } catch {
        next(new Error("unauthorized"));
      }
    });
  }

  async handleConnection(client: Socket): Promise<void> {
    const userId = client.data.userId as string | undefined;
    if (!userId) {
      client.disconnect(true);
      return;
    }
    await client.join(userRoom(userId));
    await this.presence.setOnline(userId);
    try {
      const unreadCount = await this.prisma.notification.count({
        where: { userId, readAt: null },
      });
      client.emit("notifications:initial", { unreadCount });
    } catch (error) {
      this.logger.warn(`unreadCount inicial: ${String(error)}`);
    }
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const userId = client.data.userId as string | undefined;
    if (!userId) return;
    await this.presence.setOffline(userId);
    this.safeEmit(presenceRoom(userId), "presence:change", {
      userId,
      online: false,
    });
  }

  /** RF-8: el cliente observa la presencia de los usuarios visibles. */
  @SubscribeMessage("presence:watch")
  async onPresenceWatch(
    client: Socket,
    @MessageBody() body: PresenceWatchBody,
  ): Promise<{ ok: true }> {
    const ids = Array.isArray(body?.userIds) ? body.userIds.slice(0, MAX_WATCH_IDS) : [];
    for (const id of ids) await client.join(presenceRoom(id));
    return { ok: true };
  }

  @SubscribeMessage("presence:unwatch")
  async onPresenceUnwatch(
    client: Socket,
    @MessageBody() body: PresenceWatchBody,
  ): Promise<{ ok: true }> {
    const ids = Array.isArray(body?.userIds) ? body.userIds.slice(0, MAX_WATCH_IDS) : [];
    for (const id of ids) await client.leave(presenceRoom(id));
    return { ok: true };
  }

  @SubscribeMessage("heartbeat")
  async onHeartbeat(client: Socket): Promise<{ ok: true }> {
    const userId = client.data.userId as string | undefined;
    if (userId) await this.presence.touch(userId);
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Emision hacia usuarios conectados (utilizada por NotificationsService).
  // Nunca lanza: los fallos de WS no deben romper la accion REST (RF-11).
  // ---------------------------------------------------------------------------
  emitNotificationNew(userId: string, notification: Notification, unreadCount: number): void {
    this.safeEmit(userRoom(userId), "notification:new", { notification, unreadCount });
  }

  emitUnreadCount(userId: string, unreadCount: number): void {
    this.safeEmit(userRoom(userId), "notifications:unread", { unreadCount });
  }

  emitPresenceChange(userId: string, online: boolean): void {
    this.safeEmit(presenceRoom(userId), "presence:change", { userId, online });
  }

  private safeEmit(room: string, event: string, payload: unknown): void {
    if (!this.server) return;
    try {
      this.server.to(room).emit(event, payload);
    } catch (error) {
      this.logger.warn(`emision WS a ${room} fallida: ${String(error)}`);
    }
  }
}
