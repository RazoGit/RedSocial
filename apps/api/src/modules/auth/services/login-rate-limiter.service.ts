import { Inject, Injectable, type FactoryProvider } from "@nestjs/common";
import IORedis from "ioredis";

/** Token de inyeccion para el cliente Redis compartido del modulo auth. */
export const REDIS_CLIENT = Symbol("REDIS_CLIENT");

/**
 * RF-5: 5 intentos fallidos de login por IP en 15 minutos bloquean la IP
 * durante 15 min (429 + Retry-After). Solo cuentan FALLOS: un login
 * exitoso limpia el contador.
 */
const MAX_FAILURES = 5;
const WINDOW_SECONDS = 900;

interface MemoryEntry {
  count: number;
  expiresAtMs: number;
}

/**
 * Cliente Redis opcional: si no hay REDIS_URL (tests, dev sin docker) se
 * usa un almacen en memoria equivalente. Ante errores de Redis el limiter
 * falla abierto (permite el intento) para no tumbar el login completo.
 */
export const redisClientProvider: FactoryProvider<IORedis | null> = {
  provide: REDIS_CLIENT,
  useFactory: () => {
    const url = process.env.REDIS_URL?.trim();
    return url ? new IORedis(url, { maxRetriesPerRequest: null }) : null;
  },
};

@Injectable()
export class LoginRateLimiterService {
  private readonly memory = new Map<string, MemoryEntry>();

  constructor(@Inject(REDIS_CLIENT) private readonly redis: IORedis | null) {}

  /** Segundos restantes de bloqueo para la IP; 0 si esta permitida. */
  async secondsUntilReset(ip: string): Promise<number> {
    if (!this.redis) return this.memorySecondsUntilReset(ip);
    try {
      const count = await this.redis.get(this.key(ip));
      if (count === null || Number(count) < MAX_FAILURES) return 0;
      const ttl = await this.redis.ttl(this.key(ip));
      return ttl > 0 ? ttl : WINDOW_SECONDS;
    } catch (error) {
      console.warn("[login-rate-limiter] redis no disponible, fail-open", error);
      return 0;
    }
  }

  /** Registra un intento fallido; al alcanzar el limite reinicia la ventana de castigo. */
  async registerFailure(ip: string): Promise<void> {
    if (!this.redis) {
      this.memoryRegisterFailure(ip);
      return;
    }
    try {
      const count = await this.redis.incr(this.key(ip));
      if (count === 1 || count === MAX_FAILURES) {
        await this.redis.expire(this.key(ip), WINDOW_SECONDS);
      }
    } catch (error) {
      console.warn("[login-rate-limiter] redis no disponible, fail-open", error);
    }
  }

  /** Login exitoso: la IP vuelve a estado limpio. */
  async reset(ip: string): Promise<void> {
    if (!this.redis) {
      this.memory.delete(ip);
      return;
    }
    try {
      await this.redis.del(this.key(ip));
    } catch (error) {
      console.warn("[login-rate-limiter] redis no disponible, fail-open", error);
    }
  }

  /** Limpia todo el estado; util en tests y operaciones administrativas. */
  async clear(): Promise<void> {
    this.memory.clear();
    if (!this.redis) return;
    try {
      const keys = await this.redis.keys(`${this.prefix}*`);
      if (keys.length > 0) await this.redis.del(...keys);
    } catch (error) {
      console.warn("[login-rate-limiter] redis no disponible, fail-open", error);
    }
  }

  /** Snapshot de contadores activos (observabilidad y tests). */
  counts(): ReadonlyMap<string, number> {
    const snapshot = new Map<string, number>();
    for (const [ip, entry] of this.memory) {
      if (entry.expiresAtMs > Date.now()) snapshot.set(ip, entry.count);
    }
    return snapshot;
  }

  private readonly prefix = "login_rl:";

  private key(ip: string): string {
    return `${this.prefix}${ip}`;
  }

  private memorySecondsUntilReset(ip: string): number {
    const entry = this.memory.get(ip);
    if (!entry || entry.count < MAX_FAILURES) return 0;
    const remaining = Math.ceil((entry.expiresAtMs - Date.now()) / 1000);
    return remaining > 0 ? remaining : 0;
  }

  private memoryRegisterFailure(ip: string): void {
    const now = Date.now();
    const entry = this.memory.get(ip);
    if (!entry || entry.expiresAtMs <= now) {
      this.memory.set(ip, { count: 1, expiresAtMs: now + WINDOW_SECONDS * 1000 });
      return;
    }
    entry.count += 1;
    if (entry.count >= MAX_FAILURES) {
      entry.expiresAtMs = now + WINDOW_SECONDS * 1000;
    }
  }
}
