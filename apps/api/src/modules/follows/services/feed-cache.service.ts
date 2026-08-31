import { Inject, Injectable, type FactoryProvider, Optional } from "@nestjs/common";
import IORedis from "ioredis";

/** Token de inyección para el cliente Redis del módulo feed. */
export const FEED_REDIS_CLIENT = Symbol("FEED_REDIS_CLIENT");

/** TTL del feed en Redis: 7 días. */
export const FEED_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Máximo de items por feed en Redis. */
export const FEED_MAX_ITEMS = 1000;

/** Prefijo de clave Redis para feeds. */
const KEY_PREFIX = "feed:";

/**
 * Cliente Redis opcional para feeds: sin REDIS_URL se desactiva
 * y el feed siempre consulta PostgreSQL directamente.
 */
export const feedRedisClientProvider: FactoryProvider<IORedis | null> = {
  provide: FEED_REDIS_CLIENT,
  useFactory: () => {
    const url = process.env.REDIS_URL?.trim();
    return url ? new IORedis(url, { maxRetriesPerRequest: null }) : null;
  },
};

export interface FeedCacheItem {
  postId: string;
  createdAt: string;
  authorId: string;
}

/**
 * Servicio de caché Redis para feeds (spec 005 T9/T10).
 * Almacena listas `feed:{userId}` con los IDs de posts de usuarios seguidos.
 */
@Injectable()
export class FeedCacheService {
  constructor(@Inject(FEED_REDIS_CLIENT) @Optional() private readonly redis: IORedis | null) {}

  /**
   * T9: Leer posts del feed en caché.
   * Retorna los postId ordenados del más reciente al más antiguo.
   */
  async getFeedPostIds(userId: string, limit: number, createdBefore?: string): Promise<string[]> {
    if (!this.redis) return [];

    const key = this.key(userId);
    try {
      // LRANGE 0 -1 para obtener todos, luego filtrar por cursor
      const all = await this.redis.lrange(key, 0, -1);
      if (all.length === 0) return [];

      // Cada item es un JSON: { postId, createdAt, authorId }
      const items: FeedCacheItem[] = all
        .map((raw) => {
          try {
            return JSON.parse(raw) as FeedCacheItem;
          } catch {
            return null;
          }
        })
        .filter((item): item is FeedCacheItem => item !== null);

      // Filtrar por cursor si se proporciona
      let filtered = items;
      if (createdBefore) {
        const cursorTime = new Date(createdBefore).getTime();
        filtered = items.filter((item) => new Date(item.createdAt).getTime() < cursorTime);
      }

      // Retornar solo los postId (ya están ordenados por recency gracias a LPUSH)
      return filtered.slice(0, limit).map((item) => item.postId);
    } catch {
      return [];
    }
  }

  /**
   * T11: Agregar un post al feed de un usuario (fan-out push).
   */
  async pushToFeed(userId: string, item: FeedCacheItem): Promise<void> {
    if (!this.redis) return;

    const key = this.key(userId);
    try {
      await this.redis.lpush(key, JSON.stringify(item));
      await this.redis.ltrim(key, 0, FEED_MAX_ITEMS - 1);
      await this.redis.expire(key, FEED_TTL_SECONDS);
    } catch {
      // Fail-open: si Redis falla, el feed consulta PostgreSQL
    }
  }

  /**
   * T10: Eliminar un post de todos los feeds que lo contengan.
   * Usa un Set auxiliary `feed:post:{postId}` con los userIds afectados.
   */
  async removePostFromFeeds(postId: string): Promise<void> {
    if (!this.redis) return;

    const postKey = `feed:post:${postId}`;
    try {
      const userIds = await this.redis.smembers(postKey);
      if (userIds.length === 0) return;

      const pipeline = this.redis.pipeline();
      for (const userId of userIds) {
        const feedKey = this.key(userId);
        // Buscar y eliminar el item que contiene este postId
        const items = await this.redis.lrange(feedKey, 0, -1);
        for (const raw of items) {
          try {
            const parsed = JSON.parse(raw) as FeedCacheItem;
            if (parsed.postId === postId) {
              pipeline.lrem(feedKey, 1, raw);
            }
          } catch {
            // skip malformed items
          }
        }
      }
      pipeline.del(postKey);
      await pipeline.exec();
    } catch {
      // Fail-open
    }
  }

  /**
   * Registrar que un post fue pushado al feed de ciertos usuarios.
   * Usado para la invalidación posterior (T10).
   */
  async trackPostInFeeds(postId: string, userIds: string[]): Promise<void> {
    if (!this.redis || userIds.length === 0) return;

    const postKey = `feed:post:${postId}`;
    try {
      await this.redis.sadd(postKey, ...userIds);
      await this.redis.expire(postKey, FEED_TTL_SECONDS);
    } catch {
      // Fail-open
    }
  }

  private key(userId: string): string {
    return `${KEY_PREFIX}${userId}`;
  }
}
