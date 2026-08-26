import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { FollowResponse } from "@redsocial/contracts";

import { PrismaService } from "../../prisma/prisma.service";

/**
 * Servicio de grafo social (spec 005). Follow/unfollow con contadores atómicos.
 */
@Injectable()
export class FollowsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * T7: Seguir a un usuario. Transacción atómica para incrementar contadores.
   */
  async follow(followerId: string, targetUsername: string): Promise<FollowResponse> {
    const target = await this.prisma.user.findFirst({
      where: { username: targetUsername, deletedAt: null },
      select: { id: true },
    });

    if (!target) {
      throw new NotFoundException("user_not_found");
    }

    if (followerId === target.id) {
      throw new BadRequestException("cannot_follow_self");
    }

    const existing = await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId: target.id } },
    });

    if (existing) {
      throw new ConflictException("already_following");
    }

    // Transacción atómica: insert follow + incrementar ambos contadores
    await this.prisma.$transaction([
      this.prisma.follow.create({
        data: { followerId, followingId: target.id },
      }),
      this.prisma.user.update({
        where: { id: target.id },
        data: { followersCount: { increment: 1 } },
      }),
      this.prisma.user.update({
        where: { id: followerId },
        data: { followingCount: { increment: 1 } },
      }),
    ]);

    const [follower, following] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: followerId },
        select: { followersCount: true, followingCount: true },
      }),
      this.prisma.user.findUniqueOrThrow({
        where: { id: target.id },
        select: { followersCount: true },
      }),
    ]);

    return {
      following: true,
      followersCount: following.followersCount,
      followingCount: follower.followingCount,
    };
  }

  /**
   * T7: Dejar de seguir a un usuario. Transacción atómica para decrementar contadores.
   */
  async unfollow(followerId: string, targetUsername: string): Promise<FollowResponse> {
    const target = await this.prisma.user.findFirst({
      where: { username: targetUsername, deletedAt: null },
      select: { id: true },
    });

    if (!target) {
      throw new NotFoundException("user_not_found");
    }

    const existing = await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId: target.id } },
    });

    if (!existing) {
      throw new NotFoundException("not_following");
    }

    // Transacción atómica: delete follow + decrementar ambos contadores
    await this.prisma.$transaction([
      this.prisma.follow.delete({
        where: { followerId_followingId: { followerId, followingId: target.id } },
      }),
      this.prisma.user.update({
        where: { id: target.id },
        data: { followersCount: { decrement: 1 } },
      }),
      this.prisma.user.update({
        where: { id: followerId },
        data: { followingCount: { decrement: 1 } },
      }),
    ]);

    const [follower, following] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: followerId },
        select: { followersCount: true, followingCount: true },
      }),
      this.prisma.user.findUniqueOrThrow({
        where: { id: target.id },
        select: { followersCount: true },
      }),
    ]);

    return {
      following: false,
      followersCount: following.followersCount,
      followingCount: follower.followingCount,
    };
  }

  /**
   * Verificar si un usuario sigue a otro. Usado por el endpoint de perfil.
   */
  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const follow = await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
    });
    return follow !== null;
  }

  /**
   * Obtener IDs de seguidores de un usuario (para fan-out).
   */
  async getFollowerIds(userId: string): Promise<string[]> {
    const follows = await this.prisma.follow.findMany({
      where: { followingId: userId },
      select: { followerId: true },
    });
    return follows.map((f) => f.followerId);
  }
}
