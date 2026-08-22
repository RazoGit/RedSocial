import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";

import type { RegisterRequest, RegisterResponse } from "@redsocial/contracts";

import { EmailService } from "../email/email.service";
import { PrismaService } from "../prisma/prisma.service";
import { PasswordService } from "./services/password.service";
import type { SessionMeta } from "./sessions.service";
import { SessionsService } from "./sessions.service";
import { TokensService } from "./tokens.service";

/** Regla de negocio spec 001 §5: tokens de verificacion expiran en 24 h. */
const VERIFY_EMAIL_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Mensaje 409 generico: no revela si el email ya tiene cuenta activa,
 * pendiente o borrada (RF-1, anti-enumeracion).
 */
const REGISTER_CONFLICT_MESSAGE = "No se pudo completar el registro";

const INVALID_TOKEN_MESSAGE = "Token invalido o expirado";

export interface IssuedTokens {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly emailService: EmailService,
    private readonly tokensService: TokensService,
    private readonly sessionsService: SessionsService,
  ) {}

  async register(dto: RegisterRequest): Promise<RegisterResponse> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(REGISTER_CONFLICT_MESSAGE);
    }

    const passwordHash = await this.passwordService.hashPassword(dto.password);

    let user: { id: string; email: string; emailVerified: boolean };
    try {
      user = await this.prisma.user.create({
        data: { email: dto.email, passwordHash },
      });
    } catch (error) {
      // Carrera concurrente: el indice unico de citext es la ultima palabra.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException(REGISTER_CONFLICT_MESSAGE);
      }
      throw error;
    }

    await this.enqueueVerificationEmail(user);

    return { id: user.id, email: user.email, emailVerified: user.emailVerified };
  }

  /**
   * RF-3: consume un token de verificacion valido (un solo uso, no expirado),
   * marca el email como verificado e inicia sesion.
   */
  async verifyEmail(rawToken: string, meta: SessionMeta = {}): Promise<IssuedTokens> {
    const tokenHash = this.sha256(rawToken);
    const record = await this.prisma.emailToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    const now = new Date();
    if (
      !record ||
      record.type !== "verify_email" ||
      record.usedAt !== null ||
      record.expiresAt.getTime() <= now.getTime()
    ) {
      throw new BadRequestException(INVALID_TOKEN_MESSAGE);
    }

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.emailToken.update({ where: { id: record.id }, data: { usedAt: now } });
      await tx.user.update({
        where: { id: record.userId },
        data: { emailVerified: true },
      });
    });

    return this.issueSession(record.user, meta);
  }

  /** Reenvia el email de verificacion; responde en silencio si no aplica. */
  async resendVerification(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.emailVerified || user.deletedAt !== null) {
      // Silencio anti-enumeracion y sin reenvios a cuentas ya verificadas.
      return;
    }

    // Un solo enlace vigente: invalida los verify_email sin usar anteriores.
    await this.prisma.emailToken.updateMany({
      where: { userId: user.id, type: "verify_email", usedAt: null },
      data: { usedAt: new Date() },
    });

    await this.enqueueVerificationEmail(user);
  }

  private async enqueueVerificationEmail(user: { id: string; email: string }): Promise<void> {
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = this.sha256(rawToken);
    const expiresAt = new Date(Date.now() + VERIFY_EMAIL_TTL_MS);

    await this.prisma.emailToken.create({
      data: { userId: user.id, tokenHash, type: "verify_email", expiresAt },
    });

    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    await this.emailService.enqueueVerificationEmail({
      to: user.email,
      verifyUrl: `${appUrl}/verify-email?token=${rawToken}`,
    });
  }

  /** RF-6 (emision): access JWT en cuerpo + refresh opaco para la cookie httpOnly. */
  private async issueSession(
    user: { id: string; email?: string | null },
    meta: SessionMeta,
  ): Promise<IssuedTokens> {
    const session = await this.sessionsService.create(user.id, meta);
    const accessToken = await this.tokensService.signAccessToken({
      sub: user.id,
      email: user.email ?? undefined,
    });
    return {
      accessToken,
      expiresIn: this.tokensService.accessTtlSeconds,
      refreshToken: session.refreshToken,
    };
  }

  private sha256(raw: string): string {
    return createHash("sha256").update(raw).digest("hex");
  }
}
