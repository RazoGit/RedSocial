import { Inject, Injectable, type FactoryProvider } from "@nestjs/common";
import IORedis from "ioredis";

/** Token de inyeccion para el cliente Redis del modulo users. */
export const PROFILE_REDIS_CLIENT = Symbol("PROFILE_REDIS_CLIENT");

/**
 * Cliente Redis opcional (patron login-rate-limiter): sin REDIS_URL se usa
 * un almacen en memoria equivalente, asi los tests y el dev sin docker
 * ejercen la misma semantica de caché.
 */
export const profileRedisClientProvider: FactoryProvider<IORedis | null> = {
  provide: PROFILE_REDIS_CLIENT,
  useFactory: () => {
    const url = process.env.REDIS_URL?.trim();
    return url ? new IORedis(url, { maxRetriesPerRequest: null }) : null;
  },
};

/** NFR spec 002: caché de perfiles publicos durante 60 segundos. */
export const PROFILE_CACHE_TTL_SECONDS = 60;

const KEY_PREFIX = "profile:";

/** Snapshot neutro de perfil; la vista (completa/minima) se decide por espectador. */
export interface CachedProfile {
  id: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  avatarBlurhash: string | null;
  isPrivate: boolean;
  emailVerified: boolean;
  followersCount: number;
  followingCount: number;
}

interface MemoryEntry {
  value: CachedProfile;
  expiresAtMs: number;
}

@Injectable()
export class ProfileCacheService {
  private readonly memory = new Map<string, MemoryEntry>();

  constructor(@Inject(PROFILE_REDIS_CLIENT) private readonly redis: IORedis | null) {}

  async get(username: string): Promise<CachedProfile | null> {
    const key = this.key(username);
    if (!this.redis) {
      const entry = this.memory.get(key);
      if (!entry || entry.expiresAtMs <= Date.now()) {
        this.memory.delete(key);
        return null;
      }
      return entry.value;
    }
    try {
      const raw = await this.redis.get(key);
      return raw ? (JSON.parse(raw) as CachedProfile) : null;
    } catch (error) {
      console.warn("[profile-cache] redis no disponible, fail-open", error);
      return null;
    }
  }

  async set(profile: CachedProfile): Promise<void> {
    const key = this.key(profile.username);
    const payload = JSON.stringify(profile);
    if (!this.redis) {
      this.memory.set(key, {
        value: profile,
        expiresAtMs: Date.now() + PROFILE_CACHE_TTL_SECONDS * 1000,
      });
      return;
    }
    try {
      await this.redis.set(key, payload, "EX", PROFILE_CACHE_TTL_SECONDS);
    } catch (error) {
      console.warn("[profile-cache] redis no disponible, fail-open", error);
    }
  }

  /** Invalida por uno o varios usernames (cambio de username toca dos claves). */
  async invalidate(...usernames: string[]): Promise<void> {
    const keys = usernames.filter((u) => u.length > 0).map((u) => this.key(u));
    for (const key of keys) this.memory.delete(key);
    if (!this.redis || keys.length === 0) return;
    try {
      await this.redis.del(...keys);
    } catch (error) {
      console.warn("[profile-cache] redis no disponible, fail-open", error);
    }
  }

  private key(username: string): string {
    return `${KEY_PREFIX}${username.toLowerCase()}`;
  }
}
