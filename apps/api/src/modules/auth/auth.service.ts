import { ConflictException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";

import type { RegisterRequest, RegisterResponse } from "@redsocial/contracts";

import { EmailService } from "../email/email.service";
import { PrismaService } from "../prisma/prisma.service";
import { PasswordService } from "./services/password.service";

/** Regla de negocio spec 001 §5: tokens de verificacion expiran en 24 h. */
const VERIFY_EMAIL_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Mensaje 409 generico: no revela si el email ya tiene cuenta activa,
 * pendiente o borrada (RF-1, anti-enumeracion).
 */
const REGISTER_CONFLICT_MESSAGE = "No se pudo completar el registro";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly emailService: EmailService,
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
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + VERIFY_EMAIL_TTL_MS);

    let user;
    try {
      user = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const created = await tx.user.create({
          data: { email: dto.email, passwordHash },
        });
        await tx.emailToken.create({
          data: { userId: created.id, tokenHash, type: "verify_email", expiresAt },
        });
        return created;
      });
    } catch (error) {
      // Carrera concurrente: el indice unico de citext es la ultima palabra.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException(REGISTER_CONFLICT_MESSAGE);
      }
      throw error;
    }

    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    await this.emailService.enqueueVerificationEmail({
      to: user.email,
      verifyUrl: `${appUrl}/verify-email?token=${rawToken}`,
    });

    return { id: user.id, email: user.email, emailVerified: user.emailVerified };
  }
}
