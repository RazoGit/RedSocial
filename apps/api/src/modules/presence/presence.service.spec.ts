import { describe, expect, it } from "vitest";

import { PRESENCE_TTL_SECONDS, PresenceService } from "./presence.service";

/** Fake del cliente redis: delegamos a un Map con TTL manual. */
function memoryPresence(): PresenceService {
  const svc = new PresenceService(null);
  return svc;
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
});
