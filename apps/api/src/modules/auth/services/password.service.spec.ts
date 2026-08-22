import { describe, expect, it } from "vitest";

import { PasswordService } from "./password.service";

describe("PasswordService (argon2id)", () => {
  const service = new PasswordService();

  it("genera un hash argon2id verificable", async () => {
    const hashed = await service.hashPassword("contrasena-segura-123");
    expect(hashed).toMatch(/^\$argon2id\$/);
    await expect(service.verifyPassword(hashed, "contrasena-sengura-x")).resolves.toBe(false);
    await expect(service.verifyPassword(hashed, "contrasena-segura-123")).resolves.toBe(true);
  });

  it("usa sal aleatoria: dos hashes del mismo texto difieren", async () => {
    const a = await service.hashPassword("misma-contrasena-10");
    const b = await service.hashPassword("misma-contrasena-10");
    expect(a).not.toBe(b);
    await expect(service.verifyPassword(a, "misma-contrasena-10")).resolves.toBe(true);
    await expect(service.verifyPassword(b, "misma-contrasena-10")).resolves.toBe(true);
  });

  it("verifica false ante hashes corruptos en lugar de lanzar", async () => {
    await expect(service.verifyPassword("no-es-un-hash", "lo-que-sea-1234")).resolves.toBe(false);
  });
});
