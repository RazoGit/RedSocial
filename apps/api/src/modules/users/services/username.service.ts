import { Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";

import { USERNAME_PATTERN } from "@redsocial/contracts";
import type { UsernameUnavailableReason } from "@redsocial/contracts";

import { PrismaService } from "../../prisma/prisma.service";

/** Lista de usernames prohibidos cuando USERNAME_RESERVED no esta definida. */
const DEFAULT_RESERVED =
  "admin,administrator,api,support,root,system,moderator,mod,security,help,noreply";

/** Longitud maxima de la parte derivada del email antes del sufijo. */
const DERIVED_MAX = 16;

const MAX_GENERATION_ATTEMPTS = 5;

/**
 * Reglas de username de la spec 002 (RF-1, RF-2, RF-3): formato, lista de
 * reservados, unicidad case-insensitive contra usuarios activos y contra el
 * historial de usernames aun no liberados.
 */
@Injectable()
export class UsernameService {
  private readonly reserved: ReadonlySet<string>;

  constructor(private readonly prisma: PrismaService) {
    const raw = process.env.USERNAME_RESERVED ?? DEFAULT_RESERVED;
    this.reserved = new Set(
      raw
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => entry.length > 0),
    );
  }

  isReserved(candidate: string): boolean {
    return this.reserved.has(candidate.toLowerCase());
  }

  /**
   * Motivo por el que un username no puede tomarse, o null si esta libre.
   * El formato se valida estricto (solo minusculas son validas); reservados
   * y unicidad se evaluan sin distinguir mayusculas (semantica citext).
   */
  async unavailabilityReason(candidate: string): Promise<UsernameUnavailableReason | null> {
    if (!USERNAME_PATTERN.test(candidate)) return "invalid_format";
    if (this.isReserved(candidate)) return "reserved";

    const user = await this.prisma.user.findUnique({
      where: { username: candidate },
      select: { id: true, deletedAt: true },
    });
    if (user && !user.deletedAt) return "taken";

    const pending = await this.prisma.usernameHistory.findFirst({
      where: { username: candidate, releasedAt: { gt: new Date() } },
      select: { id: true },
    });
    if (pending) return "taken";

    return null;
  }

  async isAvailable(candidate: string): Promise<boolean> {
    return (await this.unavailabilityReason(candidate)) === null;
  }

  /**
   * RF-1: username provisional derivado del email. La parte local se
   * normaliza a [a-z0-9_], se trunca a 16 y se rellena hasta 3 caracteres.
   */
  deriveProvisional(email: string): string {
    const local = email.split("@")[0] ?? "";
    let base = local
      .toLowerCase()
      .normalize("NFD")
      // Quita diacriticos descompuestos (ñ -> n + tilde) para no ensuciar.
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/_{2,}/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, DERIVED_MAX)
      .replace(/_+$/g, "");
    while (base.length < 3) base += "_";
    return base;
  }

  /**
   * Genera un username provisional unico. El primer intento usa la derivation
   * limpia del email; los siguientes anaden sufijo aleatorio corto.
   */
  async generateUniqueProvisional(email: string): Promise<string> {
    const base = this.deriveProvisional(email);
    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
      const candidate =
        attempt === 0
          ? base
          : `${base.slice(0, DERIVED_MAX - 5)}_${randomBytes(2).toString("hex")}`;
      if (await this.isAvailable(candidate)) return candidate;
    }
    throw new Error("No se pudo generar un username provisional unico");
  }

  /** Sufijo aleatorio corto para reintentos ante colisiones de carrera. */
  static suffix(): string {
    return randomBytes(2).toString("hex");
  }
}
