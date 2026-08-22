import { createHash } from "node:crypto";

import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import type { PrismaService } from "../prisma/prisma.service";
import { MAX_ACTIVE_SESSIONS, SessionsService } from "./sessions.service";

interface SessionRow {
  id: string;
  userId: string;
  refreshHash: string;
  userAgent: string | null;
  ip: string | null;
  expiresAt: Date;
  createdAt: Date;
  lastUsedAt: Date;
  revokedAt: Date | null;
  replacedByHash: string | null;
}

type CreateData = Pick<
  SessionRow,
  "userId" | "refreshHash" | "expiresAt" | "createdAt" | "lastUsedAt"
> &
  Partial<Pick<SessionRow, "userAgent" | "ip">>;

const sha256 = (raw: string): string => createHash("sha256").update(raw).digest("hex");

function createFakeDb(): { db: PrismaService; rows: SessionRow[] } {
  const rows: SessionRow[] = [];
  let seq = 0;

  const session = {
    async findUnique(args: { where: { refreshHash: string } }): Promise<SessionRow | null> {
      return rows.find((r) => r.refreshHash === args.where.refreshHash) ?? null;
    },
    async findMany(args: {
      where: { userId: string; revokedAt: null };
    }): Promise<Array<{ id: string }>> {
      return rows
        .filter((r) => r.userId === args.where.userId && r.revokedAt === args.where.revokedAt)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
        .map((r) => ({ id: r.id }));
    },
    async create(args: { data: CreateData }): Promise<SessionRow> {
      const row: SessionRow = {
        id: `s${String(++seq).padStart(3, "0")}`,
        revokedAt: null,
        replacedByHash: null,
        userAgent: args.data.userAgent ?? null,
        ip: args.data.ip ?? null,
        userId: args.data.userId,
        refreshHash: args.data.refreshHash,
        expiresAt: args.data.expiresAt,
        createdAt: args.data.createdAt,
        lastUsedAt: args.data.lastUsedAt,
      };
      rows.push(row);
      return row;
    },
    async update(args: { where: { id: string }; data: Partial<SessionRow> }): Promise<SessionRow> {
      const row = rows.find((r) => r.id === args.where.id);
      if (!row) throw new Error(`session ${args.where.id} no encontrada`);
      Object.assign(row, args.data);
      return row;
    },
    async updateMany(args: {
      where: { id?: { in: string[] }; userId?: string; revokedAt?: null };
      data: Pick<SessionRow, "revokedAt">;
    }): Promise<{ count: number }> {
      let count = 0;
      for (const row of rows) {
        if (args.where.id && !args.where.id.in.includes(row.id)) continue;
        if (args.where.userId && row.userId !== args.where.userId) continue;
        if ("revokedAt" in args.where && args.where.revokedAt === null && row.revokedAt !== null) {
          continue;
        }
        Object.assign(row, args.data);
        count += 1;
      }
      return { count };
    },
  };

  const db = {
    session,
    async $transaction<T>(fn: (tx: { session: typeof session }) => Promise<T>): Promise<T> {
      return fn({ session });
    },
  };

  return { db: db as unknown as PrismaService, rows };
}

const USER_A = "usr_aaa";
const DAY_MS = 24 * 60 * 60 * 1000;

describe("SessionsService", () => {
  it("crea una sesion activa guardando solo el hash del token crudo", async () => {
    const { db, rows } = createFakeDb();
    const service = new SessionsService(db);

    const result = await service.create(USER_A, {
      userAgent: "vitest",
      ip: "127.0.0.1",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe(USER_A);
    expect(rows[0]?.revokedAt).toBeNull();
    expect(result.refreshToken).not.toContain(sha256(result.refreshToken));
    expect(rows[0]?.refreshHash).toBe(sha256(result.refreshToken));
  });

  it("rota el token: revoca el anterior y encadena replaced_by_hash", async () => {
    const { db, rows } = createFakeDb();
    const service = new SessionsService(db);

    const first = await service.create(USER_A, {});
    const second = await service.rotate(first.refreshToken);

    expect(second.userId).toBe(USER_A);
    const oldRow = rows.find((r) => r.refreshHash === sha256(first.refreshToken));
    expect(oldRow?.revokedAt).not.toBeNull();
    expect(oldRow?.replacedByHash).toBe(sha256(second.refreshToken));

    const third = await service.rotate(second.refreshToken);
    expect(third.userId).toBe(USER_A);
  });

  it("rechaza tokens de refresh desconocidos", async () => {
    const { db } = createFakeDb();
    const service = new SessionsService(db);

    await expect(service.rotate("token-inexistente")).rejects.toThrow(UnauthorizedException);
  });

  it("detecta reuse de un token ya rotado y revoca toda la familia (RF-7)", async () => {
    const { db, rows } = createFakeDb();
    const service = new SessionsService(db);

    const first = await service.create(USER_A, {});
    const second = await service.rotate(first.refreshToken);

    await expect(service.rotate(first.refreshToken)).rejects.toThrow("token_reuse_detected");

    const userRows = rows.filter((r) => r.userId === USER_A);
    expect(userRows.length).toBeGreaterThanOrEqual(2);
    expect(userRows.every((r) => r.revokedAt !== null)).toBe(true);
    await expect(service.rotate(second.refreshToken)).rejects.toThrow(UnauthorizedException);
  });

  it("revoca la sesion si el refresh token ya expiro", async () => {
    const { db, rows } = createFakeDb();
    const service = new SessionsService(db);

    const created = await service.create(USER_A, {});
    const row = rows.find((r) => r.refreshHash === sha256(created.refreshToken));
    if (row) row.expiresAt = new Date(Date.now() - 1000);

    await expect(service.rotate(created.refreshToken)).rejects.toThrow("expired_refresh_token");
    expect(row?.revokedAt).not.toBeNull();
  });

  it("aplica tope absoluto de 90 dias desde createdAt en la rotacion (RF-8)", async () => {
    const { db, rows } = createFakeDb();
    const service = new SessionsService(db);

    const created = await service.create(USER_A, {});
    const backdated = new Date(Date.now() - 85 * DAY_MS);
    const original = rows.find((r) => r.refreshHash === sha256(created.refreshToken));
    if (original) original.createdAt = backdated;

    const rotated = await service.rotate(created.refreshToken);
    const lifespan = rotated.expiresAt.getTime() - backdated.getTime();

    expect(lifespan).toBeLessThanOrEqual(90 * DAY_MS);
    expect(rotated.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it(`expulsa la sesion mas antigua al superar ${MAX_ACTIVE_SESSIONS} activas`, async () => {
    const { db, rows } = createFakeDb();
    const service = new SessionsService(db);

    for (let i = 0; i < MAX_ACTIVE_SESSIONS + 1; i += 1) {
      await service.create(USER_A, {});
    }

    const actives = rows.filter((r) => r.revokedAt === null);
    expect(actives).toHaveLength(MAX_ACTIVE_SESSIONS);
    expect(rows[0]?.revokedAt).not.toBeNull();
    expect(rows.at(-1)?.revokedAt).toBeNull();
  });

  it("revokeAllForUser revoca todas las sesiones activas del usuario", async () => {
    const { db, rows } = createFakeDb();
    const service = new SessionsService(db);

    for (let i = 0; i < 4; i += 1) {
      await service.create(USER_A, {});
    }
    await service.revokeAllForUser(USER_A);

    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
  });
});
