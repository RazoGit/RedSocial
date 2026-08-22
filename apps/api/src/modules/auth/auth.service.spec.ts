import { BadRequestException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { AuthService } from "./auth.service";
import type { VerificationEmailPayload } from "../email/email.constants";
import { FakePrisma } from "../../testing/fake-prisma";

function sha256(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

interface Deps {
  enqueueVerificationEmail: ReturnType<typeof vi.fn>;
  createSession: ReturnType<typeof vi.fn>;
  signAccessToken: ReturnType<typeof vi.fn>;
}

function buildService(prisma = new FakePrisma()): {
  service: AuthService;
  deps: Deps;
  prisma: FakePrisma;
} {
  const deps: Deps = {
    enqueueVerificationEmail: vi.fn().mockResolvedValue(undefined),
    createSession: vi.fn().mockResolvedValue({
      refreshToken: "refresh-crudo",
      sessionId: "ses_1",
      expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    }),
    signAccessToken: vi.fn().mockResolvedValue("access.jwt.firmado"),
  };

  const service = new AuthService(
    prisma as unknown as ConstructorParameters<typeof AuthService>[0],
    {
      hashPassword: async (plain: string) => `hash(${plain})`,
      verifyPassword: async () => true,
    } as unknown as ConstructorParameters<typeof AuthService>[1],
    { enqueueVerificationEmail: deps.enqueueVerificationEmail } as unknown as ConstructorParameters<
      typeof AuthService
    >[2],
    {
      signAccessToken: deps.signAccessToken,
      accessTtlSeconds: 900,
    } as unknown as ConstructorParameters<typeof AuthService>[3],
    { create: deps.createSession } as unknown as ConstructorParameters<typeof AuthService>[4],
  );

  return { service, deps, prisma };
}

async function seedUnverifiedUser(prisma: FakePrisma): Promise<{ id: string; email: string }> {
  const user = await prisma.user.create({ data: { email: "ana@example.com", passwordHash: "h" } });
  return { id: user.id, email: user.email };
}

describe("AuthService.verifyEmail", () => {
  it("RF-3: token valido marca usedAt, verifica el usuario y emite sesion", async () => {
    const { service, deps, prisma } = await Promise.resolve(buildService());
    const user = await seedUnverifiedUser(prisma);
    const rawToken = randomBytes(32).toString("base64url");
    await prisma.emailToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(rawToken),
        type: "verify_email",
        expiresAt: new Date(Date.now() + 3600_000),
        usedAt: null,
      },
    });

    const issued = await service.verifyEmail(rawToken);

    expect(issued.accessToken).toBe("access.jwt.firmado");
    expect(issued.expiresIn).toBe(900);
    expect(issued.refreshToken).toBe("refresh-crudo");
    expect(deps.createSession).toHaveBeenCalledWith(user.id, {});
    expect(prisma.emailTokens[0].usedAt).not.toBeNull();
    expect(prisma.users[0].emailVerified).toBe(true);
  });

  it("rechaza un token inexistente sin filtrar detalles", async () => {
    const { service } = buildService();
    await expect(service.verifyEmail(randomBytes(32).toString("base64url"))).rejects.toThrow(
      BadRequestException,
    );
  });

  it("rechaza un token ya usado (un solo uso)", async () => {
    const { service, prisma } = buildService();
    const user = await seedUnverifiedUser(prisma);
    const rawToken = randomBytes(32).toString("base64url");
    await prisma.emailToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(rawToken),
        type: "verify_email",
        expiresAt: new Date(Date.now() + 3600_000),
        usedAt: new Date(Date.now() - 1000),
      },
    });

    await expect(service.verifyEmail(rawToken)).rejects.toThrow(BadRequestException);
  });

  it("rechaza un token expirado aunque no se haya usado", async () => {
    const { service, prisma } = buildService();
    const user = await seedUnverifiedUser(prisma);
    const rawToken = randomBytes(32).toString("base64url");
    await prisma.emailToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(rawToken),
        type: "verify_email",
        expiresAt: new Date(Date.now() - 1000),
        usedAt: null,
      },
    });

    await expect(service.verifyEmail(rawToken)).rejects.toThrow(BadRequestException);
  });
});

describe("AuthService.resendVerification", () => {
  it("invalida enlaces previos sin usar y encola uno nuevo", async () => {
    const { service, deps, prisma } = buildService();
    const user = await seedUnverifiedUser(prisma);
    await prisma.emailToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256("anterior"),
        type: "verify_email",
        expiresAt: new Date(Date.now() + 3600_000),
        usedAt: null,
      },
    });

    await service.resendVerification("ana@example.com");

    expect(prisma.emailTokens[0].usedAt).not.toBeNull();
    expect(prisma.emailTokens).toHaveLength(2);
    expect(deps.enqueueVerificationEmail).toHaveBeenCalledTimes(1);
    const payload = deps.enqueueVerificationEmail.mock.calls[0][0] as VerificationEmailPayload;
    expect(payload.to).toBe("ana@example.com");
  });

  it("no hace nada si el email no tiene cuenta (anti-enumeracion)", async () => {
    const { service, deps } = buildService();
    await service.resendVerification("fantasma@example.com");
    expect(deps.enqueueVerificationEmail).not.toHaveBeenCalled();
  });

  it("no reenvia si el usuario ya esta verificado", async () => {
    const { service, deps, prisma } = buildService();
    await seedUnverifiedUser(prisma);
    prisma.users[0].emailVerified = true;

    await service.resendVerification("ana@example.com");
    expect(deps.enqueueVerificationEmail).not.toHaveBeenCalled();
  });
});
