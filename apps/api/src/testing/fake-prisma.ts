import { randomUUID } from "node:crypto";

/**
 * Sustituto en memoria de PrismaService para tests de integracion.
 * Emula la semantica citext: las busquedas por email son insensibles a
 * mayusculas; el indice unico lanza un error con code="P2002".
 *
 * Solo implementa los metodos que los flujos probados utilizan; extender
 * segun avance la spec activa.
 */
export interface FakeUserRow {
  id: string;
  email: string;
  passwordHash: string | null;
  emailVerified: boolean;
  deletedAt: Date | null;
}

export interface FakeEmailTokenRow {
  id: string;
  userId: string;
  tokenHash: string;
  type: "verify_email" | "password_reset";
  expiresAt: Date;
  usedAt: Date | null;
}

export interface FakeSessionRow {
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

interface UniqueConstraintError extends Error {
  code: string;
}

function uniqueConstraintError(): UniqueConstraintError {
  return Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
}

export class FakePrisma {
  readonly users: FakeUserRow[] = [];
  readonly emailTokens: FakeEmailTokenRow[] = [];
  readonly sessions: FakeSessionRow[] = [];

  readonly user = {
    findUnique: async ({
      where,
    }: {
      where: { email?: string; id?: string };
    }): Promise<FakeUserRow | null> =>
      this.users.find(
        (u) =>
          (where.email !== undefined && u.email.toLowerCase() === where.email.toLowerCase()) ||
          (where.id !== undefined && u.id === where.id),
      ) ?? null,

    create: async ({
      data,
    }: {
      data: { email: string; passwordHash?: string | null };
    }): Promise<FakeUserRow> => {
      if (this.users.some((u) => u.email.toLowerCase() === data.email.toLowerCase())) {
        throw uniqueConstraintError();
      }
      const row: FakeUserRow = {
        id: randomUUID(),
        email: data.email,
        passwordHash: data.passwordHash ?? null,
        emailVerified: false,
        deletedAt: null,
      };
      this.users.push(row);
      return row;
    },

    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<Pick<FakeUserRow, "emailVerified" | "passwordHash">>;
    }): Promise<FakeUserRow> => {
      const row = this.users.find((u) => u.id === where.id);
      if (!row) throw new Error("user.update: fila no encontrada");
      Object.assign(row, data);
      return row;
    },
  };

  readonly emailToken = {
    create: async ({
      data,
    }: {
      data: Omit<FakeEmailTokenRow, "id"> & { usedAt?: Date | null };
    }): Promise<FakeEmailTokenRow> => {
      if (this.emailTokens.some((t) => t.tokenHash === data.tokenHash)) {
        throw uniqueConstraintError();
      }
      const row: FakeEmailTokenRow = {
        id: randomUUID(),
        usedAt: data.usedAt ?? null,
        userId: data.userId,
        tokenHash: data.tokenHash,
        type: data.type,
        expiresAt: data.expiresAt,
      };
      this.emailTokens.push(row);
      return row;
    },

    findUnique: async ({
      where,
      include,
    }: {
      where: { tokenHash?: string; id?: string };
      include?: Record<string, boolean>;
    }): Promise<(FakeEmailTokenRow & { user?: FakeUserRow | null }) | null> => {
      const row =
        this.emailTokens.find(
          (t) =>
            (where.tokenHash !== undefined && t.tokenHash === where.tokenHash) ||
            (where.id !== undefined && t.id === where.id),
        ) ?? null;
      if (!row) return null;
      if (include?.user) {
        const user = this.users.find((u) => u.id === row.userId);
        return { ...row, user: user ?? null };
      }
      return { ...row };
    },

    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<Pick<FakeEmailTokenRow, "usedAt">>;
    }): Promise<FakeEmailTokenRow> => {
      const row = this.emailTokens.find((t) => t.id === where.id);
      if (!row) throw new Error("emailToken.update: fila no encontrada");
      Object.assign(row, data);
      return row;
    },

    updateMany: async ({
      where,
      data,
    }: {
      where: { userId: string; type: FakeEmailTokenRow["type"]; usedAt: null };
      data: { usedAt: Date };
    }): Promise<{ count: number }> => {
      let count = 0;
      for (const token of this.emailTokens) {
        if (token.userId === where.userId && token.type === where.type && token.usedAt === null) {
          token.usedAt = data.usedAt;
          count += 1;
        }
      }
      return { count };
    },
  };

  readonly session = {
    create: async ({
      data,
    }: {
      data: Omit<FakeSessionRow, "id" | "revokedAt" | "replacedByHash"> &
        Partial<Pick<FakeSessionRow, "revokedAt" | "replacedByHash">>;
    }): Promise<FakeSessionRow> => {
      const row: FakeSessionRow = {
        id: randomUUID(),
        revokedAt: null,
        replacedByHash: null,
        ...data,
      };
      this.sessions.push(row);
      return row;
    },

    findUnique: async ({
      where,
    }: {
      where: { refreshHash?: string; id?: string };
    }): Promise<FakeSessionRow | null> =>
      this.sessions.find(
        (s) =>
          (where.refreshHash !== undefined && s.refreshHash === where.refreshHash) ||
          (where.id !== undefined && s.id === where.id),
      ) ?? null,

    findMany: async ({
      where,
    }: {
      where: { userId: string; revokedAt: null };
    }): Promise<FakeSessionRow[]> =>
      this.sessions.filter((s) => s.userId === where.userId && s.revokedAt === null),

    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<Omit<FakeSessionRow, "id">>;
    }): Promise<FakeSessionRow> => {
      const row = this.sessions.find((s) => s.id === where.id);
      if (!row) throw new Error("session.update: fila no encontrada");
      Object.assign(row, data);
      return row;
    },

    updateMany: async ({
      where,
      data,
    }: {
      where: { userId?: string; id?: { in: string[] }; revokedAt?: null };
      data: Partial<Omit<FakeSessionRow, "id">>;
    }): Promise<{ count: number }> => {
      let count = 0;
      for (const session of this.sessions) {
        const matchesUser = where.userId === undefined || session.userId === where.userId;
        const matchesId = where.id === undefined || (where.id.in?.includes(session.id) ?? false);
        if (matchesUser && matchesId) {
          Object.assign(session, data);
          count += 1;
        }
      }
      return { count };
    },
  };

  async $transaction<T>(fn: (tx: FakePrisma) => Promise<T>): Promise<T> {
    return fn(this);
  }
}
