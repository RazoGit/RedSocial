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
  username: string | null;
  displayName: string | null;
  bio: string | null;
  avatarKey: string | null;
  avatarThumbKey: string | null;
  avatarBlurhash: string | null;
  isPrivate: boolean;
  usernameChangedAt: Date | null;
  followersCount: number;
  followingCount: number;
  createdAt: Date;
  updatedAt: Date;
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

export interface FakeOauthAccountRow {
  id: string;
  userId: string;
  provider: string;
  providerAccountId: string;
  createdAt: Date;
}

export interface FakeUsernameHistoryRow {
  id: string;
  userId: string;
  username: string;
  releasedAt: Date;
  createdAt: Date;
}

export interface FakePostRow {
  id: string;
  authorId: string;
  text: string | null;
  deletedAt: Date | null;
  editedAt: Date | null;
  createdAt: Date;
}

export interface FakePostMediaRow {
  id: string;
  postId: string;
  key: string;
  thumbKey: string | null;
  blurhash: string | null;
  width: number | null;
  height: number | null;
  contentType: string;
  sortOrder: number;
}

export interface FakeFollowRow {
  id: string;
  followerId: string;
  followingId: string;
  createdAt: Date;
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
  readonly oauthAccounts: FakeOauthAccountRow[] = [];
  /** Filas crudas del historial; el delegado `usernameHistory` las consulta. */
  readonly usernameHistoryRows: FakeUsernameHistoryRow[] = [];
  readonly posts: FakePostRow[] = [];
  readonly _postMediaRows: FakePostMediaRow[] = [];
  readonly follows: FakeFollowRow[] = [];

  readonly user = {
    findUnique: async ({
      where,
    }: {
      where: { email?: string; id?: string; username?: string };
    }): Promise<FakeUserRow | null> =>
      this.users.find(
        (u) =>
          (where.email !== undefined && u.email.toLowerCase() === where.email.toLowerCase()) ||
          (where.id !== undefined && u.id === where.id) ||
          (where.username !== undefined &&
            u.username !== null &&
            u.username.toLowerCase() === where.username.toLowerCase()),
      ) ?? null,

    findFirst: async ({
      where,
    }: {
      where: { username?: string; deletedAt?: null };
    }): Promise<FakeUserRow | null> => {
      return (
        this.users.find(
          (u) =>
            (where.username === undefined ||
              (u.username !== null &&
                u.username.toLowerCase() === where.username!.toLowerCase())) &&
            (where.deletedAt === undefined || u.deletedAt === null),
        ) ?? null
      );
    },

    findUniqueOrThrow: async ({ where }: { where: { id?: string } }): Promise<FakeUserRow> => {
      const row = this.users.find((u) => where.id !== undefined && u.id === where.id);
      if (!row) throw new Error("user.findUniqueOrThrow: not found");
      return { ...row };
    },

    create: async ({
      data,
    }: {
      data: {
        email: string;
        passwordHash?: string | null;
        emailVerified?: boolean;
        username?: string | null;
      };
    }): Promise<FakeUserRow> => {
      if (this.users.some((u) => u.email.toLowerCase() === data.email.toLowerCase())) {
        throw uniqueConstraintError();
      }
      if (
        data.username !== null &&
        data.username !== undefined &&
        this.users.some(
          (u) => u.username !== null && u.username.toLowerCase() === data.username!.toLowerCase(),
        )
      ) {
        throw uniqueConstraintError();
      }
      const now = new Date();
      const row: FakeUserRow = {
        id: randomUUID(),
        email: data.email,
        passwordHash: data.passwordHash ?? null,
        emailVerified: data.emailVerified ?? false,
        deletedAt: null,
        username: data.username ?? null,
        displayName: null,
        bio: null,
        avatarKey: null,
        avatarThumbKey: null,
        avatarBlurhash: null,
        isPrivate: false,
        usernameChangedAt: null,
        followersCount: 0,
        followingCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      this.users.push(row);
      return row;
    },

    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<Omit<FakeUserRow, "id" | "createdAt">> & Record<string, unknown>;
    }): Promise<FakeUserRow> => {
      const row = this.users.find((u) => u.id === where.id);
      if (!row) throw new Error("user.update: fila no encontrada");
      // Handle atomic increment/decrement: { increment: N } | { decrement: N }
      const rowAny = row as unknown as Record<string, unknown>;
      for (const [key, value] of Object.entries(data)) {
        if (value && typeof value === "object" && "increment" in value) {
          rowAny[key] = (rowAny[key] as number) + (value as { increment: number }).increment;
        } else if (value && typeof value === "object" && "decrement" in value) {
          rowAny[key] = (rowAny[key] as number) - (value as { decrement: number }).decrement;
        } else {
          rowAny[key] = value;
        }
      }
      row.updatedAt = new Date();
      return row;
    },
  };

  readonly usernameHistory = {
    create: async ({
      data,
    }: {
      data: Omit<FakeUsernameHistoryRow, "id" | "createdAt"> & { createdAt?: Date };
    }): Promise<FakeUsernameHistoryRow> => {
      const row: FakeUsernameHistoryRow = {
        id: randomUUID(),
        createdAt: new Date(),
        ...data,
      };
      this.usernameHistoryRows.push(row);
      return row;
    },

    findFirst: async ({
      where,
    }: {
      where: {
        username?: string;
        userId?: string;
        releasedAt?: { gt: Date };
      };
    }): Promise<FakeUsernameHistoryRow | null> =>
      this.usernameHistoryRows.find(
        (h) =>
          (where.username === undefined ||
            h.username.toLowerCase() === where.username.toLowerCase()) &&
          (where.userId === undefined || h.userId === where.userId) &&
          (where.releasedAt === undefined ||
            h.releasedAt.getTime() > where.releasedAt.gt.getTime()),
      ) ?? null,

    findMany: async ({
      where,
    }: {
      where: { userId?: string; releasedAt?: { gt: Date } };
    }): Promise<FakeUsernameHistoryRow[]> =>
      this.usernameHistoryRows.filter(
        (h) =>
          (where.userId === undefined || h.userId === where.userId) &&
          (where.releasedAt === undefined ||
            h.releasedAt.getTime() > where.releasedAt.gt.getTime()),
      ),
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
      where: { userId?: string; id?: string | { in: string[] }; revokedAt?: null };
      data: Partial<Omit<FakeSessionRow, "id">>;
    }): Promise<{ count: number }> => {
      let count = 0;
      const wantedIds = typeof where.id === "string" ? [where.id] : where.id?.in;
      for (const session of this.sessions) {
        const matchesUser = where.userId === undefined || session.userId === where.userId;
        const matchesId = where.id === undefined || (wantedIds?.includes(session.id) ?? false);
        const matchesRevoked = where.revokedAt === undefined || session.revokedAt === null;
        if (matchesUser && matchesId && matchesRevoked) {
          Object.assign(session, data);
          count += 1;
        }
      }
      return { count };
    },
  };

  readonly oauthAccount = {
    findUnique: async ({
      where,
    }: {
      where: { provider_providerAccountId: { provider: string; providerAccountId: string } };
    }): Promise<FakeOauthAccountRow | null> =>
      this.oauthAccounts.find(
        (a) =>
          a.provider === where.provider_providerAccountId.provider &&
          a.providerAccountId === where.provider_providerAccountId.providerAccountId,
      ) ?? null,

    create: async ({
      data,
    }: {
      data: { userId: string; provider: string; providerAccountId: string };
    }): Promise<FakeOauthAccountRow> => {
      if (
        this.oauthAccounts.some(
          (a) => a.provider === data.provider && a.providerAccountId === data.providerAccountId,
        )
      ) {
        throw uniqueConstraintError();
      }
      const row: FakeOauthAccountRow = {
        id: randomUUID(),
        createdAt: new Date(),
        ...data,
      };
      this.oauthAccounts.push(row);
      return row;
    },
  };

  readonly post = {
    create: async ({
      data,
    }: {
      data: { authorId: string; text?: string | null };
    }): Promise<FakePostRow> => {
      const now = new Date();
      const row: FakePostRow = {
        id: randomUUID(),
        authorId: data.authorId,
        text: data.text ?? null,
        deletedAt: null,
        editedAt: null,
        createdAt: now,
      };
      this.posts.push(row);
      return { ...row };
    },

    findUnique: async ({
      where,
      include,
    }: {
      where: { id: string };
      include?: {
        author?: {
          select: {
            username: boolean;
            displayName: boolean;
            avatarThumbKey: boolean;
            isPrivate: boolean;
            id: boolean;
          };
        };
        media?: { orderBy: { sortOrder: string } };
      };
    }): Promise<(FakePostRow & { author?: FakeUserRow; media?: FakePostMediaRow[] }) | null> => {
      const row = this.posts.find((p) => p.id === where.id);
      if (!row) return null;
      const result: FakePostRow & { author?: FakeUserRow; media?: FakePostMediaRow[] } = { ...row };
      if (include?.author) {
        result.author = this.users.find((u) => u.id === row.authorId) ?? undefined;
      }
      if (include?.media) {
        result.media = this._postMediaRows
          .filter((m) => m.postId === row.id)
          .sort((a, b) => a.sortOrder - b.sortOrder);
      }
      return result;
    },

    findFirst: async ({
      where,
    }: {
      where: { username?: string; deletedAt?: null | Date };
    }): Promise<FakeUserRow | null> => {
      return (
        this.users.find(
          (u) =>
            (where.username === undefined ||
              (u.username !== null &&
                u.username.toLowerCase() === where.username!.toLowerCase())) &&
            (where.deletedAt === null ? u.deletedAt === null : true),
        ) ?? null
      );
    },

    findMany: async ({
      where,
      include,
      orderBy,
      take,
    }: {
      where: { authorId?: string; deletedAt?: null; createdAt?: { lt?: Date } };
      include?: { media?: { orderBy: { sortOrder: string } } };
      orderBy?: { createdAt: string };
      take?: number;
    }): Promise<(FakePostRow & { media?: FakePostMediaRow[] })[]> => {
      let filtered = this.posts.filter(
        (p) =>
          (where.authorId === undefined || p.authorId === where.authorId) &&
          (where.deletedAt === undefined || p.deletedAt === null) &&
          (where.createdAt?.lt === undefined || p.createdAt < where.createdAt.lt),
      );
      if (orderBy?.createdAt === "desc") {
        filtered = filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }
      if (take !== undefined) {
        filtered = filtered.slice(0, take);
      }
      return filtered.map((p) => {
        const result: FakePostRow & { media?: FakePostMediaRow[] } = { ...p };
        if (include?.media) {
          result.media = this._postMediaRows
            .filter((m) => m.postId === p.id)
            .sort((a, b) => a.sortOrder - b.sortOrder);
        }
        return result;
      });
    },

    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<Omit<FakePostRow, "id" | "createdAt">>;
    }): Promise<FakePostRow> => {
      const row = this.posts.find((p) => p.id === where.id);
      if (!row) throw new Error("post.update: fila no encontrada");
      Object.assign(row, data);
      return { ...row };
    },
  };

  readonly postMedia = {
    create: async ({
      data,
    }: {
      data: { postId: string; key: string; contentType: string; sortOrder: number };
    }): Promise<FakePostMediaRow> => {
      const row: FakePostMediaRow = {
        id: randomUUID(),
        postId: data.postId,
        key: data.key,
        thumbKey: null,
        blurhash: null,
        width: null,
        height: null,
        contentType: data.contentType,
        sortOrder: data.sortOrder,
      };
      this._postMediaRows.push(row);
      return { ...row };
    },

    findUnique: async ({ where }: { where: { id: string } }): Promise<FakePostMediaRow | null> => {
      return this._postMediaRows.find((m) => m.id === where.id) ?? null;
    },

    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<Pick<FakePostMediaRow, "thumbKey" | "blurhash" | "width" | "height">>;
    }): Promise<FakePostMediaRow> => {
      const row = this._postMediaRows.find((m) => m.id === where.id);
      if (!row) throw new Error("postMedia.update: fila no encontrada");
      Object.assign(row, data);
      return { ...row };
    },
  };

  readonly follow = {
    findUnique: async ({
      where,
    }: {
      where: { followerId_followingId: { followerId: string; followingId: string } };
    }): Promise<FakeFollowRow | null> =>
      this.follows.find(
        (f) =>
          f.followerId === where.followerId_followingId.followerId &&
          f.followingId === where.followerId_followingId.followingId,
      ) ?? null,

    create: async ({
      data,
    }: {
      data: { followerId: string; followingId: string };
    }): Promise<FakeFollowRow> => {
      const existing = this.follows.find(
        (f) => f.followerId === data.followerId && f.followingId === data.followingId,
      );
      if (existing) throw uniqueConstraintError();
      const row: FakeFollowRow = {
        id: randomUUID(),
        followerId: data.followerId,
        followingId: data.followingId,
        createdAt: new Date(),
      };
      this.follows.push(row);
      return row;
    },

    delete: async ({
      where,
    }: {
      where: { followerId_followingId: { followerId: string; followingId: string } };
    }): Promise<FakeFollowRow> => {
      const idx = this.follows.findIndex(
        (f) =>
          f.followerId === where.followerId_followingId.followerId &&
          f.followingId === where.followerId_followingId.followingId,
      );
      if (idx === -1) throw new Error("follow.delete: not found");
      const [removed] = this.follows.splice(idx, 1);
      return removed!;
    },

    findMany: async ({
      where,
    }: {
      where: { followingId?: string; followerId?: string };
    }): Promise<FakeFollowRow[]> =>
      this.follows.filter(
        (f) =>
          (where.followingId === undefined || f.followingId === where.followingId) &&
          (where.followerId === undefined || f.followerId === where.followerId),
      ),
  };

  async $transaction<T>(fnOrOps: ((tx: FakePrisma) => Promise<T>) | unknown[]): Promise<T> {
    if (typeof fnOrOps === "function") {
      return fnOrOps(this);
    }
    // Array form: execute each operation sequentially
    const results: unknown[] = [];
    for (const op of fnOrOps) {
      if (op && typeof op === "object" && typeof (op as { then?: unknown }).then === "function") {
        results.push(await op);
      }
    }
    return results as T;
  }
}
