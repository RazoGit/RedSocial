import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";

import { TokensService } from "./tokens.service";

const ISSUER = "redsocial-api";
const AUDIENCE = "redsocial-web";

async function craftToken(expiration: Date, audience = AUDIENCE): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? "");
  return new SignJWT({ email: "craft@example.com" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("usr_craft")
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(audience)
    .setExpirationTime(Math.floor(expiration.getTime() / 1000))
    .sign(secret);
}

describe("TokensService", () => {
  it("firma y verifica un access token preservando el payload", async () => {
    const service = new TokensService();
    const token = await service.signAccessToken({
      sub: "usr_123",
      email: "user@example.com",
    });
    const payload = await service.verifyAccessToken(token);
    expect(payload.sub).toBe("usr_123");
    expect(payload.email).toBe("user@example.com");
    const claims = payload as unknown as Record<string, unknown>;
    expect(claims["iss"]).toBe(ISSUER);
    expect(claims["aud"]).toBe(AUDIENCE);
  });

  it("rechaza tokens con firma manipulada", async () => {
    const service = new TokensService();
    const token = await service.signAccessToken({ sub: "usr_123" });
    const tampered = `${token.slice(0, -4)}xxxx`;
    await expect(service.verifyAccessToken(tampered)).rejects.toThrow();
  });

  it("acepta tokens expirados dentro del margen de reloj de 30 s", async () => {
    const service = new TokensService();
    const almostExpired = await craftToken(new Date(Date.now() - 10 * 1000));
    const payload = await service.verifyAccessToken(almostExpired);
    expect(payload.sub).toBe("usr_craft");
  });

  it("rechaza tokens expirados fuera del margen de reloj", async () => {
    const service = new TokensService();
    const longExpired = await craftToken(new Date(Date.now() - 60 * 1000));
    await expect(service.verifyAccessToken(longExpired)).rejects.toThrow();
  });

  it("rechaza tokens con audience incorrecta", async () => {
    const service = new TokensService();
    const wrongAudience = await craftToken(new Date(Date.now() + 60 * 1000), "otra-app");
    await expect(service.verifyAccessToken(wrongAudience)).rejects.toThrow();
  });
});
