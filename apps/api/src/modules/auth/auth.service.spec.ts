import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { AuthService } from "./auth.service";
import type { PasswordResetEmailPayload, VerificationEmailPayload } from "../email/email.constants";
import { FakePrisma } from "../../testing/fake-prisma";

function sha256(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

interface PasswordMock {
  hashPassword: (plain: string) => Promise<string>;
  verifyPassword: (hash: string, plain: string) => Promise<boolean>;
}

interface Deps {
  enqueueVerificationEmail: ReturnType<typeof vi.fn>;
  enqueuePasswordResetEmail: ReturnType<typeof vi.fn>;
  enqueuePasswordChangedEmail: ReturnType<typeof vi.fn>;
  createSession: ReturnType<typeof vi.fn>;
  revokeAllForUser: ReturnType<typeof vi.fn>;
  signAccessToken: ReturnType<typeof vi.fn>;
  verifyPassword: ReturnType<typeof vi.fn>;
}

interface BuildOptions {
  password?: Partial<PasswordMock>;
}

function buildService(
  prisma = new FakePrisma(),
  options: BuildOptions = {},
): {
  service: AuthService;
  deps: Deps;
  prisma: FakePrisma;
} {
  const deps: Deps = {
    enqueueVerificationEmail: vi.fn().mockResolvedValue(undefined),
    enqueuePasswordResetEmail: vi.fn().mockResolvedValue(undefined),
    enqueuePasswordChangedEmail: vi.fn().mockResolvedValue(undefined),
    createSession: vi.fn().mockResolvedValue({
      refreshToken: "refresh-crudo",
      sessionId: "ses_1",
      expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    }),
    revokeAllForUser: vi.fn().mockResolvedValue(undefined),
    signAccessToken: vi.fn().mockResolvedValue("access.jwt.firmado"),
    verifyPassword: vi.fn().mockResolvedValue(true),
  };

  const passwordService = {
    hashPassword: options.password?.hashPassword ?? (async (plain: string) => `hash(${plain})`),
    verifyPassword:
      options.password?.verifyPassword ??
      ((hash: string, plain: string) => deps.verifyPassword(hash, plain)),
  };

  const service = new AuthService(
    prisma as unknown as ConstructorParameters<typeof AuthService>[0],
    passwordService as unknown as ConstructorParameters<typeof AuthService>[1],
    {
      enqueueVerificationEmail: deps.enqueueVerificationEmail,
      enqueuePasswordResetEmail: deps.enqueuePasswordResetEmail,
      enqueuePasswordChangedEmail: deps.enqueuePasswordChangedEmail,
    } as unknown as ConstructorParameters<typeof AuthService>[2],
    {
      signAccessToken: deps.signAccessToken,
      accessTtlSeconds: 900,
    } as unknown as ConstructorParameters<typeof AuthService>[3],
    {
      create: deps.createSession,
      revokeAllForUser: deps.revokeAllForUser,
    } as unknown as ConstructorParameters<typeof AuthService>[4],
  );

  return { service, deps, prisma };
}

async function seedUnverifiedUser(prisma: FakePrisma): Promise<{ id: string; email: string }> {
  const user = await prisma.user.create({ data: { email: "ana@example.com", passwordHash: "h" } });
  return { id: user.id, email: user.email };
}

describe("AuthService.login", () => {
  it("RF-4: permite login aunque el email no este verificado y emite sesion", async () => {
    const { service, deps, prisma } = buildService();
    const user = await seedUnverifiedUser(prisma);
    expect(prisma.users[0].emailVerified).toBe(false);

    const issued = await service.login({ email: "ana@example.com", password: "lo-que-sea" });

    expect(issued.accessToken).toBe("access.jwt.firmado");
    expect(issued.expiresIn).toBe(900);
    expect(issued.refreshToken).toBe("refresh-crudo");
    expect(deps.createSession).toHaveBeenCalledWith(user.id, {});
  });

  it("compara contra el hash real del usuario (citext: email en mayusculas)", async () => {
    const { service, deps, prisma } = buildService();
    await seedUnverifiedUser(prisma);

    await service.login({ email: "ANA@EXAMPLE.COM", password: "x" });

    expect(deps.verifyPassword).toHaveBeenCalledWith("h", "x");
  });

  it("rechaza contrasena incorrecta con 401 generico", async () => {
    const { service } = buildService(undefined, {
      password: {
        hashPassword: async () => "hash-real",
        verifyPassword: async (hash) => hash === "hash-real" && false,
      },
    });
    await expect(service.login({ email: "ana@example.com", password: "mala" })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("email inexistente: iguala el coste temporal comparando contra un hash señuelo", async () => {
    const { service, deps } = buildService();

    await expect(
      service.login({ email: "fantasma@example.com", password: "cualquiera" }),
    ).rejects.toThrow(UnauthorizedException);

    expect(deps.verifyPassword).toHaveBeenCalledTimes(1);
    const usedHash = deps.verifyPassword.mock.calls[0][0] as string;
    expect(usedHash).toMatch(/^hash\(/);
  });

  it("usuario borrado se trata como inexistente aunque la contrasena coincida", async () => {
    const { service, deps, prisma } = buildService();
    await seedUnverifiedUser(prisma);
    prisma.users[0].deletedAt = new Date();

    await expect(service.login({ email: "ana@example.com", password: "correcta" })).rejects.toThrow(
      UnauthorizedException,
    );
    expect(deps.createSession).not.toHaveBeenCalled();
  });

  it("cuenta OAuth-only (sin passwordHash) rechaza login local sin filtrar estado", async () => {
    const { service, deps, prisma } = buildService();
    await prisma.user.create({ data: { email: "oauth@example.com", passwordHash: null } });

    await expect(
      service.login({ email: "oauth@example.com", password: "cualquiera" }),
    ).rejects.toThrow(UnauthorizedException);
    expect(deps.createSession).not.toHaveBeenCalled();
  });
});

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

describe("AuthService.logout / logoutAll / me (RF-10)", () => {
  const FUTURE = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  const NOW = new Date();

  function seedSession(
    prisma: FakePrisma,
    userId: string,
    suffix: string,
  ): Promise<{ id: string; revokedAt: Date | null }> {
    return prisma.session.create({
      data: {
        userId,
        refreshHash: `hash-${suffix}`,
        userAgent: null,
        ip: null,
        expiresAt: FUTURE,
        createdAt: NOW,
        lastUsedAt: NOW,
      },
    });
  }

  it("logout revoca solo la sesion indicada del usuario", async () => {
    const { service, prisma } = buildService();
    const user = await seedUnverifiedUser(prisma);
    const target = await seedSession(prisma, user.id, "a");
    const other = await seedSession(prisma, user.id, "b");

    await service.logout(user.id, target.id);

    expect(prisma.sessions.find((s) => s.id === target.id)?.revokedAt).not.toBeNull();
    expect(prisma.sessions.find((s) => s.id === other.id)?.revokedAt).toBeNull();
  });

  it("logout ignora sesiones de otro usuario", async () => {
    const { service, prisma } = buildService();
    const owner = await seedUnverifiedUser(prisma);
    const intruder = await prisma.user.create({ data: { email: "otto@example.com" } });
    const foreign = await seedSession(prisma, intruder.id, "x");

    await service.logout(owner.id, foreign.id);

    expect(prisma.sessions[0].revokedAt).toBeNull();
  });

  it("logout sin sid no toca la base de datos", async () => {
    const { service, prisma } = buildService();
    const user = await seedUnverifiedUser(prisma);
    const session = await seedSession(prisma, user.id, "a");

    await service.logout(user.id);

    expect(prisma.sessions[0].id).toBe(session.id);
    expect(prisma.sessions[0].revokedAt).toBeNull();
  });

  it("logoutAll revoca todas las sesiones activas", async () => {
    const { service, deps, prisma } = buildService();
    const user = await seedUnverifiedUser(prisma);
    await seedSession(prisma, user.id, "a");
    await seedSession(prisma, user.id, "b");

    await service.logoutAll(user.id);

    expect(deps.revokeAllForUser).toHaveBeenCalledWith(user.id);
  });

  it("me devuelve el perfil publico del usuario", async () => {
    const { service, prisma } = buildService();
    const user = await seedUnverifiedUser(prisma);

    const profile = await service.me(user.id);

    expect(profile).toEqual({ id: user.id, email: "ana@example.com", emailVerified: false });
  });

  it("me lanza 401 si el usuario fue borrado o no existe", async () => {
    const { service, prisma } = buildService();
    const user = await seedUnverifiedUser(prisma);

    prisma.users[0].deletedAt = new Date();
    await expect(service.me(user.id)).rejects.toThrow(UnauthorizedException);
    await expect(service.me("inexistente")).rejects.toThrow(UnauthorizedException);
  });
});

describe("AuthService.forgotPassword / resetPassword (RF-11, RF-12)", () => {
  const FUTURE = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  const NOW = new Date();

  async function seedSession(
    prisma: FakePrisma,
    userId: string,
    suffix: string,
  ): Promise<{ id: string; revokedAt: Date | null }> {
    return prisma.session.create({
      data: {
        userId,
        refreshHash: `hash-${suffix}`,
        userAgent: null,
        ip: null,
        expiresAt: FUTURE,
        createdAt: NOW,
        lastUsedAt: NOW,
      },
    });
  }

  /** Ejecuta forgotPassword y devuelve el token crudo capturado del enlace encolado. */
  async function requestReset(service: AuthService, deps: Deps, email: string): Promise<string> {
    await service.forgotPassword(email);
    const payload = deps.enqueuePasswordResetEmail.mock.calls.at(
      -1,
    )?.[0] as PasswordResetEmailPayload;
    return new URL(payload.resetUrl).searchParams.get("token") ?? "";
  }

  it("forgotPassword crea token hasheado de tipo password_reset y encola el enlace", async () => {
    const { service, deps, prisma } = buildService();
    const user = await seedUnverifiedUser(prisma);

    const rawToken = await requestReset(service, deps, user.email);

    expect(rawToken).toHaveLength(43); // 32 bytes base64url
    const stored = prisma.emailTokens[0];
    expect(stored.type).toBe("password_reset");
    expect(stored.tokenHash).toBe(sha256(rawToken));
    expect(stored.usedAt).toBeNull();
    // Valido durante 1 h (con margen de reloj de la asercion).
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now() + 55 * 60 * 1000);
    expect(deps.enqueuePasswordResetEmail).toHaveBeenCalledWith({
      to: "ana@example.com",
      resetUrl: expect.stringContaining(`/reset-password?token=${rawToken}`),
    });
    expect(deps.enqueueVerificationEmail).not.toHaveBeenCalled();
  });

  it("forgotPassword invalida los enlaces anteriores sin usar", async () => {
    const { service, deps, prisma } = buildService();
    const user = await seedUnverifiedUser(prisma);

    await requestReset(service, deps, user.email);
    await requestReset(service, deps, user.email);

    const used = prisma.emailTokens.filter((t) => t.usedAt !== null);
    const pending = prisma.emailTokens.filter((t) => t.usedAt === null);
    expect(used).toHaveLength(1);
    expect(pending).toHaveLength(1);
  });

  it("forgotPassword es silencioso para un email desconocido", async () => {
    const { service, deps } = buildService();

    await service.forgotPassword("nadie@example.com");

    expect(deps.enqueuePasswordResetEmail).not.toHaveBeenCalled();
  });

  it("forgotPassword ignora cuentas borradas y OAuth sin contrasena local", async () => {
    const { service, deps, prisma } = buildService();
    const deleted = await prisma.user.create({ data: { email: "borrado@example.com" } });
    deleted.deletedAt = new Date();
    await prisma.user.create({ data: { email: "oauth@example.com", passwordHash: null } });

    await service.forgotPassword(deleted.email);
    await service.forgotPassword("oauth@example.com");

    expect(deps.enqueuePasswordResetEmail).not.toHaveBeenCalled();
    expect(prisma.emailTokens).toHaveLength(0);
  });

  it("resetPassword guarda la nueva contrasena hasheada y consume el token", async () => {
    const { service, deps, prisma } = buildService();
    const user = await seedUnverifiedUser(prisma);
    const rawToken = await requestReset(service, deps, user.email);

    await service.resetPassword({ token: rawToken, password: "NuevaContrasena1" });

    const stored = prisma.emailTokens[0];
    expect(stored.usedAt).not.toBeNull();
    expect(prisma.users[0].passwordHash).toBe("hash(NuevaContrasena1)");
  });

  it("resetPassword revoca todas las sesiones activas y notifica por email", async () => {
    const { service, deps, prisma } = buildService();
    const user = await seedUnverifiedUser(prisma);
    await seedSession(prisma, user.id, "a");
    await seedSession(prisma, user.id, "b");
    const rawToken = await requestReset(service, deps, user.email);

    await service.resetPassword({ token: rawToken, password: "NuevaContrasena1" });

    expect(prisma.sessions.map((s) => s.revokedAt)).toEqual([expect.any(Date), expect.any(Date)]);
    expect(deps.enqueuePasswordChangedEmail).toHaveBeenCalledWith({ to: "ana@example.com" });
  });

  it("resetPassword rechaza un token ya usado sin cambiar nada", async () => {
    const { service, deps, prisma } = buildService();
    const user = await seedUnverifiedUser(prisma);
    const rawToken = await requestReset(service, deps, user.email);
    await service.resetPassword({ token: rawToken, password: "NuevaContrasena1" });
    const hashAfterFirst = prisma.users[0].passwordHash;

    await expect(
      service.resetPassword({ token: rawToken, password: "OtraContrasena2" }),
    ).rejects.toThrow(new BadRequestException("Token invalido o expirado"));
    expect(prisma.users[0].passwordHash).toBe(hashAfterFirst);
  });

  it("resetPassword rechaza tokens ajenos, vencidos o de otro tipo", async () => {
    const { service, deps, prisma } = buildService();
    const user = await seedUnverifiedUser(prisma);
    await requestReset(service, deps, user.email);

    // Token inexistente
    await expect(
      service.resetPassword({ token: randomBytes(32).toString("base64url"), password: "Nueva1" }),
    ).rejects.toThrow(BadRequestException);

    // Expirado
    const expiredRaw = randomBytes(32).toString("base64url");
    await prisma.emailToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(expiredRaw),
        type: "password_reset",
        expiresAt: new Date(Date.now() - 1000),
        usedAt: null,
      },
    });
    await expect(
      service.resetPassword({ token: expiredRaw, password: "NuevaContrasena1" }),
    ).rejects.toThrow(BadRequestException);

    // Tipo verify_email
    const verifyRaw = randomBytes(32).toString("base64url");
    await prisma.emailToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(verifyRaw),
        type: "verify_email",
        expiresAt: FUTURE,
        usedAt: null,
      },
    });
    await expect(
      service.resetPassword({ token: verifyRaw, password: "NuevaContrasena1" }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.users[0].passwordHash).toBe("h");
    expect(deps.enqueuePasswordChangedEmail).not.toHaveBeenCalled();
  });
});
