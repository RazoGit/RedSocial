import { describe, expect, it, vi } from "vitest";

import { PRESENCE_TTL_SECONDS, PresenceService } from "./presence.service";

/** Fake del cliente redis: delegamos a un Map con TTL manual. */
function memoryPresence(): PresenceService {
  const svc = new PresenceService(null);
  return svc;
}

/** Cliente redis fake: Map interno + hooks para inyectar fallos. */
function fakeRedisClient(overrides?: {
  failSet?: boolean;
  failDel?: boolean;
  failExists?: boolean;
  failExpire?: boolean;
}) {
  const store = new Map<string, string>();
  const client = {
    set: vi.fn(async (key: string, value: string) => {
      if (overrides?.failSet) throw new Error("redis down");
      store.set(key, value);
      return "OK";
    }),
    expire: vi.fn(async () => {
      if (overrides?.failExpire) throw new Error("redis down");
      return 1;
    }),
    del: vi.fn(async (key: string) => {
      if (overrides?.failDel) throw new Error("redis down");
      return store.delete(key) ? 1 : 0;
    }),
    exists: vi.fn(async (key: string) => {
      if (overrides?.failExists) throw new Error("redis down");
      return store.has(key) ? 1 : 0;
    }),
  };
  return { client, store };
}

describe("PresenceService", () => {
  it("setOnline marca online y isOnline devuelve true", async () => {
    const svc = memoryPresence();
    await svc.setOnline("u1");
    await expect(svc.isOnline("u1")).resolves.toBe(true);
  });

  it("isOnline devuelve false sin presencia previa", async () => {
    const svc = memoryPresence();
    await expect(svc.isOnline("desconocido")).resolves.toBe(false);
  });

  it("setOffline elimina la presencia", async () => {
    const svc = memoryPresence();
    await svc.setOnline("u1");
    await svc.setOffline("u1");
    await expect(svc.isOnline("u1")).resolves.toBe(false);
  });

  it("touch refresca el TTL (no pierde online)", async () => {
    const svc = memoryPresence();
    await svc.setOnline("u1");
    await svc.touch("u1");
    await expect(svc.isOnline("u1")).resolves.toBe(true);
  });

  it("expira tras el TTL en el fallback de memoria", async () => {
    const svc = memoryPresence();
    const originalNow = Date.now;
    Date.now = () => 1_000_000;
    try {
      // setOnline escribe expiresAtMs = now + TTL
      await svc.setOnline("u1");
      await expect(svc.isOnline("u1")).resolves.toBe(true);

      Date.now = () => 1_000_000 + PRESENCE_TTL_SECONDS * 1000 + 1;
      await expect(svc.isOnline("u1")).resolves.toBe(false);
    } finally {
      Date.now = originalNow;
    }
  });

  it("touch sin conexion previa no crea presencia", async () => {
    const svc = memoryPresence();
    await svc.touch("u1");
    await expect(svc.isOnline("u1")).resolves.toBe(false);
  });

  it("setOnline via Redis delegado con TTL y isOnline via exists", async () => {
    const { client } = fakeRedisClient();
    const svc = new PresenceService(client as never);
    await svc.setOnline("u1");
    expect(client.set).toHaveBeenCalledWith("presence:u1", "1", "EX", PRESENCE_TTL_SECONDS);
    await expect(svc.isOnline("u1")).resolves.toBe(true);
    await expect(svc.isOnline("ausente")).resolves.toBe(false);
  });

  it("setOffline via Redis borra la clave", async () => {
    const { client, store } = fakeRedisClient();
    const svc = new PresenceService(client as never);
    await svc.setOnline("u1");
    expect(store.has("presence:u1")).toBe(true);
    await svc.setOffline("u1");
    expect(client.del).toHaveBeenCalledWith("presence:u1");
    await expect(svc.isOnline("u1")).resolves.toBe(false);
  });

  it("touch via Redis refresca el TTL con expire", async () => {
    const { client } = fakeRedisClient();
    const svc = new PresenceService(client as never);
    await svc.setOnline("u1");
    await svc.touch("u1");
    expect(client.expire).toHaveBeenCalledWith("presence:u1", PRESENCE_TTL_SECONDS);
  });

  it("falla-open sin lanzar si Redis falla en setOnline", async () => {
    const { client } = fakeRedisClient({ failSet: true });
    const svc = new PresenceService(client as never);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      await expect(svc.setOnline("u1")).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("isOnline devuelve false (sin lanzar) si Redis falla en exists", async () => {
    const { client } = fakeRedisClient({ failExists: true });
    const svc = new PresenceService(client as never);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      await expect(svc.isOnline("u1")).resolves.toBe(false);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("setOffline y touch no lanzan si Redis falla", async () => {
    const { client } = fakeRedisClient({ failDel: true, failExpire: true });
    const svc = new PresenceService(client as never);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      await expect(svc.setOffline("u1")).resolves.toBeUndefined();
      await expect(svc.touch("u1")).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
