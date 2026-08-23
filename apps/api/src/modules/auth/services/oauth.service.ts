import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../../prisma/prisma.service";
import { UsernameService } from "../../users/services/username.service";
import type { ProviderProfile } from "../strategies/oauth-strategy.types";
import type { OAuthProviderId } from "./oauth-config.service";

/** Mensaje generico identico al de registro local (anti-enumeracion). */
const REGISTER_CONFLICT_MESSAGE = "No se pudo completar el registro";

/**
 * RF-9: vincula la identidad del proveedor a una cuenta existente o crea una
 * nueva verificada. Las estrategias ya garantizan emailVerified=true antes de
 * llegar aqui; cuentas borradas se tratan como inexistentes (sin re-vincular).
 */
@Injectable()
export class OauthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usernameService: UsernameService,
  ) {}

  async linkOrCreate(
    provider: OAuthProviderId,
    profile: ProviderProfile,
  ): Promise<{ id: string; email: string }> {
    try {
      const linked = await this.prisma.oauthAccount.findUnique({
        where: {
          provider_providerAccountId: {
            provider,
            providerAccountId: profile.providerAccountId,
          },
        },
      });
      if (linked) {
        const user = await this.prisma.user.findUnique({ where: { id: linked.userId } });
        if (!user || user.deletedAt !== null) {
          throw new UnauthorizedException("oauth_cuenta_no_disponible");
        }
        return user;
      }

      const existing = await this.prisma.user.findUnique({
        where: { email: profile.email },
      });
      if (existing && existing.deletedAt === null) {
        await this.prisma.oauthAccount.create({
          data: {
            userId: existing.id,
            provider,
            providerAccountId: profile.providerAccountId,
          },
        });
        return existing;
      }

      // RF-1 spec 002: username provisional tambien para cuentas sociales.
      const username = await this.usernameService.generateUniqueProvisional(profile.email);
      const created = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { email: profile.email, passwordHash: null, emailVerified: true, username },
        });
        await tx.oauthAccount.create({
          data: {
            userId: user.id,
            provider,
            providerAccountId: profile.providerAccountId,
          },
        });
        return user;
      });
      return created;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2002" || error.code === "P2003")
      ) {
        // Carrera concurrente contra el indice unico citext / FK.
        throw new ConflictException(REGISTER_CONFLICT_MESSAGE);
      }
      throw error;
    }
  }
}
