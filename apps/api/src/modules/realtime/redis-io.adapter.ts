import { IoAdapter } from "@nestjs/platform-socket.io";
import type { ServerOptions } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import type { INestApplicationContext } from "@nestjs/common";
import IORedis from "ioredis";

/**
 * Adaptador Socket.IO con broadcast multi-instancia (spec 007 plan §7):
 * si hay REDIS_URL usa el pub/sub de Redis; sin Redis (tests, dev sin docker)
 * se conserva el adaptador por defecto.
 */
export class RedisIoAdapter extends IoAdapter {
  private pubClient: IORedis | null = null;
  private subClient: IORedis | null = null;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  connect(): void {
    const url = process.env.REDIS_URL?.trim();
    if (url) {
      this.pubClient = new IORedis(url, { maxRetriesPerRequest: null });
      this.subClient = this.pubClient.duplicate();
    } else {
      this.pubClient = null;
      this.subClient = null;
    }
  }

  createIOServer(port: number, options?: ServerOptions): unknown {
    const server = super.createIOServer(port, options) as ReturnType<IoAdapter["createIOServer"]>;
    if (this.pubClient && this.subClient) {
      server.adapter(createAdapter(this.pubClient, this.subClient));
    }
    return server;
  }
}
