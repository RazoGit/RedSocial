import { Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";

/** Tope de sesiones activas por usuario (RF-7 del plan). */
export const MAX_ACTIVE_SESSIONS = 10;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_CAP_MS = 90 * 24 * 60 * 60 * 1000;

export interface SessionMeta {
  userAgent?: string;
  ip?: string;
}

export interface CreatedSession {
  refreshToken: string;
  sessionId: string;
  expiresAt: Date;
}

export interface RotatedSession extends CreatedSession {
  userId: string;
}

/**
 * Gestion de refresh tokens opacos:
 * - Se guarda solo el hash SHA-256 del token crudo.
 * - La rotacion marca la sesion anterior con replaced_by_hash.
 * - Reutilizar un token ya rotado revoca toda la familia del usuario (RF-7).
 * - La expiracion es deslizante de 30 dias con tope absoluto de 90 dias
 *   desde createdAt (RF-8).
 * - Al superar MAX_ACTIVE_SESSIONS se expulsa la sesion activa mas antigua.
 */
@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  private hashToken(raw: string): string {
    return createHash("sha256").update(raw).digest("hex");
  }

  private newRawToken(): string {
    return randomBytes(32).toString("base64url");
  }

  private expiryFor(baseCreatedAt: Date): Date {
    const sliding = new Date(Date.now() + REFRESH_TTL_MS);
    const cap = new Date(baseCreatedAt.getTime() + SESSION_CAP_MS);
    return sliding < cap ? sliding : cap;
  }

  private async trimActiveSessions(userId: string): Promise<void> {
    const actives: Array<{ id: string }> = await this.prisma.session.findMany({
      where: { userId, revokedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    const excess = actives.length - MAX_ACTIVE_SESSIONS;
    if (excess > 0) {
      await this.prisma.session.updateMany({
        where: { id: { in: actives.slice(0, excess).map((s) => s.id) } },
        data: { revokedAt: new Date() },
      });
    }
  }

  async create(userId: string, meta: SessionMeta): Promise<CreatedSession> {
    const refreshToken = this.newRawToken();
    const now = new Date();
    const session = await this.prisma.session.create({
      data: {
        userId,
        refreshHash: this.hashToken(refreshToken),
        userAgent: meta.userAgent,
        ip: meta.ip,
        expiresAt: new Date(now.getTime() + REFRESH_TTL_MS),
        createdAt: now,
        lastUsedAt: now,
      },
    });
    await this.trimActiveSessions(userId);
    return { refreshToken, sessionId: session.id, expiresAt: session.expiresAt };
  }

  async rotate(rawRefreshToken: string): Promise<RotatedSession> {
    const current = await this.prisma.session.findUnique({
      where: { refreshHash: this.hashToken(rawRefreshToken) },
    });

    if (!current) {
      throw new UnauthorizedException("invalid_refresh_token");
    }

    if (current.revokedAt !== null) {
      // RF-7: reuse detectado -> se revoca toda la familia del usuario.
      await this.revokeAllForUser(current.userId);
      throw new UnauthorizedException("token_reuse_detected");
    }

    const now = new Date();
    if (current.expiresAt.getTime() <= now.getTime()) {
      await this.prisma.session.update({
        where: { id: current.id },
        data: { revokedAt: now },
      });
      throw new UnauthorizedException("expired_refresh_token");
    }

    const refreshToken = this.newRawToken();
    const nextHash = this.hashToken(refreshToken);
    const expiresAt = this.expiryFor(current.createdAt);

    const created = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.session.update({
        where: { id: current.id },
        data: { revokedAt: now, replacedByHash: nextHash, lastUsedAt: now },
      });
      return tx.session.create({
        data: {
          userId: current.userId,
          refreshHash: nextHash,
          userAgent: current.userAgent,
          ip: current.ip,
          expiresAt,
          createdAt: now,
          lastUsedAt: now,
        },
      });
    });

    await this.trimActiveSessions(current.userId);
    return {
      refreshToken,
      sessionId: created.id,
      userId: current.userId,
      expiresAt,
    };
  }

  async revoke(rawRefreshToken: string): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { refreshHash: this.hashToken(rawRefreshToken) },
    });
    if (session && session.revokedAt === null) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
    }
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
