import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";

import type {
  CheckUsernameResponse,
  MeProfileResponse,
  MinimalProfileResponse,
  UpdateProfileRequest,
  UserProfileResponse,
} from "@redsocial/contracts";
import type { User } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "./services/storage.service";
import { UsernameService } from "./services/username.service";
import { CachedProfile, ProfileCacheService } from "./services/profile-cache.service";

/** RF-3: tras el primer cambio (gratis), maximo un cambio cada 14 dias. */
const USERNAME_CHANGE_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

/** RF-3: el username anterior queda reservado 30 dias antes de liberarse. */
const USERNAME_RELEASE_MS = 30 * 24 * 60 * 60 * 1000;

/** Validez de las URLs GET firmadas que serviran el avatar. */
export const AVATAR_URL_TTL_SECONDS = 3600;

/**
 * Perfil del usuario autenticado y reglas de cambio de username
 * (spec 002, RF-2/RF-3/RF-6).
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usernameService: UsernameService,
    private readonly storage: StorageService,
    private readonly cache: ProfileCacheService,
  ) {}

  async getMe(userId: string): Promise<MeProfileResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt !== null) {
      throw new UnauthorizedException("user_not_found");
    }
    return this.toMeProfile(user);
  }

  async updateMe(userId: string, dto: UpdateProfileRequest): Promise<MeProfileResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt !== null) {
      throw new UnauthorizedException("user_not_found");
    }

    const data: Partial<
      Pick<User, "displayName" | "bio" | "isPrivate" | "username" | "usernameChangedAt">
    > = {};
    if (dto.displayName !== undefined) data.displayName = dto.displayName;
    if (dto.bio !== undefined) data.bio = dto.bio;
    if (dto.isPrivate !== undefined) data.isPrivate = dto.isPrivate;

    // RF-3: solo aplica reglas si realmente cambia el username.
    let usernameChanged = false;
    if (
      dto.username !== undefined &&
      dto.username.toLowerCase() !== (user.username ?? "").toLowerCase()
    ) {
      await this.assertUsernameChangeAllowed(user, dto.username);
      data.username = dto.username;
      data.usernameChangedAt = new Date();
      usernameChanged = true;
    }

    let updated: User;
    try {
      updated = await this.prisma.user.update({ where: { id: userId }, data });
    } catch (error) {
      // Carrera concurrente contra el indice unico citext.
      if (error instanceof Object && (error as { code?: string }).code === "P2002") {
        throw new ConflictException("username_tomado");
      }
      throw error;
    }

    // NFR: toda escritura invalida la caché de perfil (vieja y nueva clave).
    await this.cache.invalidate(
      ...(usernameChanged
        ? [user.username ?? "", updated.username ?? ""]
        : [updated.username ?? ""]),
    );

    return this.toMeProfile(updated);
  }

  /** Disponibilidad publica para check-username (RF-2). */
  async checkUsername(candidate: string): Promise<CheckUsernameResponse> {
    const reason = await this.usernameService.unavailabilityReason(candidate);
    return reason === null ? { available: true } : { available: false, reason };
  }

  /**
   * RF-5: perfil publico por username. Perfil privado ante terceros entrega
   * solo la vista minima (Gherkin spec §6); el duerno siempre ve el completo.
   * Respaldado por caché Redis de 60 s (NFR p95 <100 ms).
   */
  async getPublicProfile(
    usernameParam: string,
    viewerId?: string,
  ): Promise<UserProfileResponse | MinimalProfileResponse> {
    const username = usernameParam.toLowerCase();

    let snapshot = await this.cache.get(username);
    if (!snapshot) {
      const user = await this.prisma.user.findUnique({ where: { username } });
      if (!user || user.deletedAt !== null) {
        throw new NotFoundException("usuario_no_encontrado");
      }
      snapshot = {
        id: user.id,
        username: user.username ?? "",
        displayName: user.displayName,
        bio: user.bio,
        avatarUrl: await this.avatarUrlFor(user),
        avatarBlurhash: user.avatarBlurhash,
        isPrivate: user.isPrivate,
        emailVerified: user.emailVerified,
        followersCount: user.followersCount,
        followingCount: user.followingCount,
      };
      await this.cache.set(snapshot);
    }

    if (!snapshot.isPrivate || viewerId === snapshot.id) {
      // Si el viewer esta autenticado, agregar isFollowing
      if (viewerId && viewerId !== snapshot.id) {
        const isFollowing = await this.prisma.follow.findUnique({
          where: {
            followerId_followingId: {
              followerId: viewerId,
              followingId: snapshot.id,
            },
          },
        });
        return { ...snapshot, isFollowing: isFollowing !== null };
      }
      return snapshot;
    }
    return this.toMinimal(snapshot);
  }

  private toMinimal(snapshot: CachedProfile): MinimalProfileResponse {
    return {
      username: snapshot.username,
      displayName: snapshot.displayName,
      avatarUrl: snapshot.avatarUrl,
      avatarBlurhash: snapshot.avatarBlurhash,
    };
  }

  private async assertUsernameChangeAllowed(user: User, next: string): Promise<void> {
    // El primer cambio es gratis; despues, cooldown de 14 dias (RF-3).
    if (user.usernameChangedAt !== null) {
      const elapsedMs = Date.now() - user.usernameChangedAt.getTime();
      if (elapsedMs < USERNAME_CHANGE_COOLDOWN_MS) {
        throw new UnprocessableEntityException("username_cooldown_activo");
      }
    }

    const reason = await this.usernameService.unavailabilityReason(next);
    if (reason === "taken") throw new ConflictException("username_tomado");
    if (reason === "reserved") throw new UnprocessableEntityException("username_reservado");

    // El anterior queda reservado 30 dias en el historial antes de liberarse.
    if (user.username !== null) {
      await this.prisma.usernameHistory.create({
        data: {
          userId: user.id,
          username: user.username,
          releasedAt: new Date(Date.now() + USERNAME_RELEASE_MS),
        },
      });
    }
  }

  /**
   * URL GET firmada (1 h) del thumbnail; vive dentro de la respuesta y de la
   * caché de perfil sin desincronizarse (validez > TTL de cache, plan §5).
   */
  private async avatarUrlFor(user: User): Promise<string | null> {
    if (!user.avatarThumbKey) return null;
    return this.storage.presignGetUrl(user.avatarThumbKey, AVATAR_URL_TTL_SECONDS);
  }

  private async toMeProfile(user: User): Promise<MeProfileResponse> {
    return {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      username: user.username ?? "",
      displayName: user.displayName,
      bio: user.bio,
      avatarUrl: await this.avatarUrlFor(user),
      avatarBlurhash: user.avatarBlurhash,
      isPrivate: user.isPrivate,
      updatedAt: user.updatedAt.toISOString(),
    };
  }
}
