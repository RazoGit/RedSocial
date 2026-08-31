import { Inject, Injectable, type FactoryProvider } from "@nestjs/common";
import IORedis from "ioredis";

/** Token de inyeccion del cliente Redis para presence. */
export const PRESENCE_REDIS_CLIENT = Symbol("PRESENCE_REDIS_CLIENT");

/**
 * Cliente Redis opcional (patron profile-cache): sin REDIS_URL se usa un
 * almacen en memoria equivalente para que tests y dev sin docker ejercen
 * la misma semantica (spec 007, plan §5).
 */
export const presenceRedisClientProvider: FactoryProvider<IORedis | null> = {
  provide: PRESENCE_REDIS_CLIENT,
  useFactory: () => {
    const url = process.env.REDIS_URL?.trim();
    return url ? new IORedis(url, { maxRetriesPerRequest: null }) : null;
  },
};

/** TTL de presence: safetynet ante crashes (desconexion sin disconnect limpio). */
export const PRESENCE_TTL_SECONDS = 120;

const KEY_PREFIX = "presence:";

interface MemoryEntry {
  expiresAtMs: number;
}

/**
 * Presence basica online/offline (spec 007 RF-8/RF-9) sobre Redis.
 * La fuente de verdad del badge de notificaciones NO pasa por aqui; esto
 * solo alimenta el indicador visual y los eventos presence:change.
 */
@Injectable()
export class PresenceService {
  private readonly memory = new Map<string, MemoryEntry>();

  constructor(@Inject(PRESENCE_REDIS_CLIENT) private readonly redis: IORedis | null) {}

  private key(userId: string): string {
    return `${KEY_PREFIX}${userId}`;
  }

  async setOnline(userId: string): Promise<void> {
    const key = this.key(userId);
    if (!this.redis) {
      this.memory.set(key, {
        expiresAtMs: Date.now() + PRESENCE_TTL_SECONDS * 1000,
      });
      return;
    }
    try {
      await this.redis.set(key, "1", "EX", PRESENCE_TTL_SECONDS);
    } catch (error) {
      // fail-open: presence no debe interrumpir la conexion WS.
      this.memory.set(key, {
        expiresAtMs: Date.now() + PRESENCE_TTL_SECONDS * 1000,
      });
      console.warn("[presence] redis no disponible, fail-open", error);
    }
  }

  /** Heartbeat/actividad: refresca el TTL sin borrar nada. */
  async touch(userId: string): Promise<void> {
    const key = this.key(userId);
    if (!this.redis) {
      const entry = this.memory.get(key);
      if (entry) {
        entry.expiresAtMs = Date.now() + PRESENCE_TTL_SECONDS * 1000;
      }
      return;
    }
    try {
      await this.redis.expire(key, PRESENCE_TTL_SECONDS);
    } catch (error) {
      console.warn("[presence] redis no disponible, fail-open", error);
    }
  }

  async setOffline(userId: string): Promise<void> {
    this.memory.delete(this.key(userId));
    if (!this.redis) return;
    try {
      await this.redis.del(this.key(userId));
    } catch (error) {
      console.warn("[presence] redis no disponible, fail-open", error);
    }
  }

  /** true si la clave existe y no expiro. Nunca lanza (Redis caido => false). */
  async isOnline(userId: string): Promise<boolean> {
    if (!this.redis) {
      const entry = this.memory.get(this.key(userId));
      if (!entry) return false;
      if (entry.expiresAtMs <= Date.now()) {
        this.memory.delete(this.key(userId));
        return false;
      }
      return true;
    }
    try {
      return (await this.redis.exists(this.key(userId))) === 1;
    } catch (error) {
      console.warn("[presence] redis no disponible, fail-open", error);
      return false;
    }
  }
}
