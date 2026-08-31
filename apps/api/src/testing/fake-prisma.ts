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
  likesCount: number;
  commentsCount: number;
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

export interface FakeLikeRow {
  id: string;
  userId: string;
  postId: string;
  createdAt: Date;
}

export interface FakeCommentRow {
  id: string;
  postId: string;
  authorId: string;
  text: string;
  parentId: string | null;
  deletedAt: Date | null;
  createdAt: Date;
}

export interface FakeNotificationRow {
  id: string;
  userId: string;
  actorId: string;
  type: "like" | "comment" | "reply" | "follow";
  postId: string | null;
  commentId: string | null;
  readAt: Date | null;
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
  readonly likes: FakeLikeRow[] = [];
  readonly comments: FakeCommentRow[] = [];
  readonly notifications: FakeNotificationRow[] = [];

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
        isPrivate?: boolean;
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
        isPrivate: data.isPrivate ?? false,
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
        likesCount: 0,
        commentsCount: 0,
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

    findUniqueOrThrow: async ({
      where,
      select,
    }: {
      where: { id: string };
      select?: { likesCount?: boolean; commentsCount?: boolean };
    }): Promise<FakePostRow> => {
      const row = this.posts.find((p) => p.id === where.id);
      if (!row) throw new Error("post.findUniqueOrThrow: not found");
      if (select) {
        const partial: Record<string, unknown> = { id: row.id };
        if (select.likesCount) partial.likesCount = row.likesCount;
        if (select.commentsCount) partial.commentsCount = row.commentsCount;
        return partial as unknown as FakePostRow;
      }
      return { ...row };
    },

    findFirst: async ({
      where,
    }: {
      where: { id?: string; deletedAt?: null };
    }): Promise<FakePostRow | null> => {
      return (
        this.posts.find(
          (p) =>
            (where.id === undefined || p.id === where.id) &&
            (where.deletedAt === null ? p.deletedAt === null : true),
        ) ?? null
      );
    },

    findMany: async ({
      where,
      include,
      orderBy,
      take,
    }: {
      where: {
        authorId?: string | { in: string[] };
        deletedAt?: null;
        createdAt?: { lt?: Date };
      };
      include?: {
        media?: { orderBy: { sortOrder: string } };
        author?: {
          select: {
            id: boolean;
            username: boolean;
            displayName: boolean;
            avatarThumbKey: boolean;
          };
        };
      };
      orderBy?: { createdAt: string };
      take?: number;
    }): Promise<(FakePostRow & { media?: FakePostMediaRow[]; author?: FakeUserRow })[]> => {
      let filtered = this.posts.filter((p) => {
        const matchAuthor =
          where.authorId === undefined
            ? true
            : typeof where.authorId === "string"
              ? p.authorId === where.authorId
              : where.authorId.in.includes(p.authorId);
        const matchDeleted = where.deletedAt === undefined || p.deletedAt === null;
        const matchCursor = where.createdAt?.lt === undefined || p.createdAt < where.createdAt.lt;
        return matchAuthor && matchDeleted && matchCursor;
      });
      if (orderBy?.createdAt === "desc") {
        filtered = filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }
      if (take !== undefined) {
        filtered = filtered.slice(0, take);
      }
      return filtered.map((p) => {
        const result: FakePostRow & { media?: FakePostMediaRow[]; author?: FakeUserRow } = { ...p };
        if (include?.media) {
          result.media = this._postMediaRows
            .filter((m) => m.postId === p.id)
            .sort((a, b) => a.sortOrder - b.sortOrder);
        }
        if (include?.author) {
          result.author = this.users.find((u) => u.id === p.authorId) ?? undefined;
        }
        return result;
      });
    },

    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<Omit<FakePostRow, "id" | "createdAt">> & Record<string, unknown>;
    }): Promise<FakePostRow> => {
      const row = this.posts.find((p) => p.id === where.id);
      if (!row) throw new Error("post.update: fila no encontrada");
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

  readonly like = {
    findUnique: async ({
      where,
    }: {
      where: { userId_postId: { userId: string; postId: string } };
    }): Promise<FakeLikeRow | null> =>
      this.likes.find(
        (l) => l.userId === where.userId_postId.userId && l.postId === where.userId_postId.postId,
      ) ?? null,

    create: async ({
      data,
    }: {
      data: { userId: string; postId: string };
    }): Promise<FakeLikeRow> => {
      const existing = this.likes.find((l) => l.userId === data.userId && l.postId === data.postId);
      if (existing) throw uniqueConstraintError();
      const row: FakeLikeRow = {
        id: randomUUID(),
        userId: data.userId,
        postId: data.postId,
        createdAt: new Date(),
      };
      this.likes.push(row);
      return row;
    },

    delete: async ({
      where,
    }: {
      where: { userId_postId: { userId: string; postId: string } };
    }): Promise<FakeLikeRow> => {
      const idx = this.likes.findIndex(
        (l) => l.userId === where.userId_postId.userId && l.postId === where.userId_postId.postId,
      );
      if (idx === -1) throw new Error("like.delete: not found");
      const [removed] = this.likes.splice(idx, 1);
      return removed!;
    },

    findMany: async ({
      where,
      select,
    }: {
      where: {
        userId?: string;
        postId?: string | { in: string[] };
        userIds?: string[];
        postIdIn?: string[];
      };
      select?: { postId?: boolean };
    }): Promise<FakeLikeRow[]> => {
      const filtered = this.likes.filter((l) => {
        if (where.userId !== undefined && l.userId !== where.userId) return false;
        if (where.postId !== undefined) {
          if (typeof where.postId === "string") {
            if (l.postId !== where.postId) return false;
          } else if (!where.postId.in.includes(l.postId)) {
            return false;
          }
        }
        if (where.userIds !== undefined && !where.userIds.includes(l.userId)) return false;
        if (where.postIdIn !== undefined && !where.postIdIn.includes(l.postId)) return false;
        return true;
      });
      if (select?.postId) {
        return filtered.map((l) => ({ ...l }));
      }
      return filtered;
    },

    count: async ({
      where,
    }: {
      where: { postId?: string; userId?: string; postIdIn?: string[] };
    }): Promise<number> => {
      if (where.postIdIn) {
        const counts: Record<string, number> = {};
        for (const l of this.likes) {
          if (where.postIdIn.includes(l.postId)) {
            counts[l.postId] = (counts[l.postId] ?? 0) + 1;
          }
        }
        return Object.values(counts).reduce((a, b) => a + b, 0);
      }
      return this.likes.filter(
        (l) =>
          (where.postId === undefined || l.postId === where.postId) &&
          (where.userId === undefined || l.userId === where.userId),
      ).length;
    },
  };

  readonly comment = {
    create: async ({
      data,
      include,
    }: {
      data: {
        postId: string;
        authorId: string;
        text: string;
        parentId?: string | null;
      };
      include?: {
        author?: {
          select: { username: boolean; displayName: boolean; avatarThumbKey: boolean };
        };
      };
    }): Promise<
      FakeCommentRow & {
        author?: {
          username: string | null;
          displayName: string | null;
          avatarThumbKey: string | null;
        };
      }
    > => {
      const row: FakeCommentRow = {
        id: randomUUID(),
        postId: data.postId,
        authorId: data.authorId,
        text: data.text,
        parentId: data.parentId ?? null,
        deletedAt: null,
        createdAt: new Date(),
      };
      this.comments.push(row);
      const result: FakeCommentRow & {
        author?: {
          username: string | null;
          displayName: string | null;
          avatarThumbKey: string | null;
        };
      } = { ...row };
      if (include?.author) {
        const user = this.users.find((u) => u.id === data.authorId);
        result.author = user
          ? {
              username: user.username,
              displayName: user.displayName,
              avatarThumbKey: user.avatarThumbKey,
            }
          : { username: "unknown", displayName: null, avatarThumbKey: null };
      }
      return result;
    },

    findFirst: async ({
      where,
      select,
    }: {
      where: { id?: string; postId?: string; deletedAt?: null };
      select?: Record<string, boolean>;
    }): Promise<FakeCommentRow | null> => {
      const row = this.comments.find(
        (c) =>
          (where.id === undefined || c.id === where.id) &&
          (where.postId === undefined || c.postId === where.postId) &&
          (where.deletedAt === undefined || c.deletedAt === null),
      );
      if (!row) return null;
      if (select) {
        const partial: Record<string, unknown> = {};
        for (const key of Object.keys(select)) {
          if (key in row) {
            partial[key] = (row as unknown as Record<string, unknown>)[key];
          }
        }
        return partial as unknown as FakeCommentRow;
      }
      return { ...row };
    },

    findUnique: async ({ where }: { where: { id: string } }): Promise<FakeCommentRow | null> =>
      this.comments.find((c) => c.id === where.id && c.deletedAt === null) ?? null,

    findMany: async ({
      where,
      include,
      orderBy,
      take,
    }: {
      where: {
        postId?: string;
        parentId?: string | null;
        deletedAt?: null;
        createdAt?: { lt?: Date };
      };
      include?: {
        author?: {
          select: { username: boolean; displayName: boolean; avatarThumbKey: boolean };
        };
        _count?: { select: { replies: boolean } };
      };
      orderBy?: { createdAt: string };
      take?: number;
    }): Promise<
      (FakeCommentRow & {
        author?: {
          username: string | null;
          displayName: string | null;
          avatarThumbKey: string | null;
        };
        _count?: { replies: number };
      })[]
    > => {
      let filtered = this.comments.filter((c) => {
        const matchPost = where.postId === undefined || c.postId === where.postId;
        const matchParent =
          where.parentId === undefined ||
          (where.parentId === null ? c.parentId === null : c.parentId === where.parentId);
        const matchDeleted = where.deletedAt === undefined || c.deletedAt === null;
        const matchCursor = where.createdAt?.lt === undefined || c.createdAt < where.createdAt.lt;
        return matchPost && matchParent && matchDeleted && matchCursor;
      });
      if (orderBy?.createdAt === "desc") {
        filtered = filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }
      if (take !== undefined) {
        filtered = filtered.slice(0, take);
      }
      return filtered.map((c) => {
        const result: FakeCommentRow & {
          author?: {
            username: string | null;
            displayName: string | null;
            avatarThumbKey: string | null;
          };
          _count?: { replies: number };
        } = { ...c };
        if (include?.author) {
          const user = this.users.find((u) => u.id === c.authorId);
          result.author = user
            ? {
                username: user.username,
                displayName: user.displayName,
                avatarThumbKey: user.avatarThumbKey,
              }
            : { username: "unknown", displayName: null, avatarThumbKey: null };
        }
        if (include?._count?.select?.replies) {
          result._count = {
            replies: this.comments.filter((r) => r.parentId === c.id && r.deletedAt === null)
              .length,
          };
        }
        return result;
      });
    },

    delete: async ({ where }: { where: { id: string } }): Promise<FakeCommentRow> => {
      const row = this.comments.find((c) => c.id === where.id);
      if (!row) throw new Error("comment.delete: not found");
      row.deletedAt = new Date();
      return { ...row };
    },

    count: async ({
      where,
    }: {
      where: { postId?: string; parentId?: string | null; deletedAt?: null };
    }): Promise<number> =>
      this.comments.filter(
        (c) =>
          (where.postId === undefined || c.postId === where.postId) &&
          (where.parentId === undefined ||
            (where.parentId === null ? c.parentId === null : c.parentId === where.parentId)) &&
          (where.deletedAt === undefined || c.deletedAt === null),
      ).length,
  };

  readonly notification = {
    create: async ({
      data,
    }: {
      data: {
        userId: string;
        actorId: string;
        type: FakeNotificationRow["type"];
        postId?: string | null;
        commentId?: string | null;
      };
    }): Promise<FakeNotificationRow> => {
      const row: FakeNotificationRow = {
        id: randomUUID(),
        userId: data.userId,
        actorId: data.actorId,
        type: data.type,
        postId: data.postId ?? null,
        commentId: data.commentId ?? null,
        readAt: null,
        createdAt: new Date(),
      };
      this.notifications.push(row);
      return { ...row };
    },

    count: async ({ where }: { where: { userId?: string; readAt?: null } }): Promise<number> =>
      this.notifications.filter(
        (n) =>
          (where.userId === undefined || n.userId === where.userId) &&
          (where.readAt === null ? n.readAt === null : true),
      ).length,

    findMany: async ({
      where,
      orderBy,
      take,
      include,
    }: {
      where: {
        userId: string;
        createdAt?: { lt?: Date };
      };
      orderBy?: { createdAt: string };
      take?: number;
      include?: {
        actor?: { select: Record<string, boolean> };
      };
    }): Promise<
      (FakeNotificationRow & {
        actor?: {
          id: string;
          username: string | null;
          displayName: string | null;
          avatarThumbKey: string | null;
        };
      })[]
    > => {
      let filtered = this.notifications.filter((n) => {
        const matchUser = n.userId === where.userId;
        const matchCursor = where.createdAt?.lt === undefined || n.createdAt < where.createdAt.lt;
        return matchUser && matchCursor;
      });
      if (orderBy?.createdAt === "desc") {
        filtered = filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }
      if (take !== undefined) {
        filtered = filtered.slice(0, take);
      }
      return filtered.map((n) => {
        const result: FakeNotificationRow & {
          actor?: {
            id: string;
            username: string | null;
            displayName: string | null;
            avatarThumbKey: string | null;
          };
        } = { ...n };
        if (include?.actor) {
          const user = this.users.find((u) => u.id === n.actorId);
          result.actor = user
            ? {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                avatarThumbKey: user.avatarThumbKey,
              }
            : { id: n.actorId, username: null, displayName: null, avatarThumbKey: null };
        }
        return result;
      });
    },

    findUnique: async ({ where }: { where: { id: string } }): Promise<FakeNotificationRow | null> =>
      this.notifications.find((n) => n.id === where.id) ?? null,

    updateMany: async ({
      where,
      data,
    }: {
      where: {
        userId: string;
        id?: string | { in: string[] };
        readAt?: null;
      };
      data: { readAt: Date };
    }): Promise<{ count: number }> => {
      let count = 0;
      const idMatch = (n: { id: string }): boolean => {
        if (where.id === undefined) return true;
        if (typeof where.id === "string") return n.id === where.id;
        return where.id.in.includes(n.id);
      };
      for (const n of this.notifications) {
        const matchUser = n.userId === where.userId;
        const matchId = idMatch(n);
        const matchUnread = where.readAt === null ? n.readAt === null : true;
        if (matchUser && matchId && matchUnread) {
          n.readAt = data.readAt;
          count += 1;
        }
      }
      return { count };
    },
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
