import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import type { FastifyReply } from "fastify";

import { OauthConfigService } from "./oauth-config.service";
import { OauthStateService } from "./oauth-state.service";

function buildStateService(ttlSeconds = 600): OauthStateService {
  return new OauthStateService(new OauthConfigService(), ttlSeconds);
}

describe("OauthStateService", () => {
  it("google emite state+nonce y el roundtrip cookie/query verifica", async () => {
    const service = buildStateService();
    const issued = await service.issue("google");

    expect(issued.state).toHaveLength(43);
    expect(issued.nonce).toBeDefined();

    const verified = await service.verify(issued.cookieValue, "google", issued.state);
    expect(verified.nonce).toBe(issued.nonce);
  });

  it("github no genera nonce (no es OIDC)", async () => {
    const service = buildStateService();
    const issued = await service.issue("github");

    expect(issued.nonce).toBeUndefined();
    const verified = await service.verify(issued.cookieValue, "github", issued.state);
    expect(verified.nonce).toBeUndefined();
  });

  it("rechaza un state del query distinto al firmado", async () => {
    const service = buildStateService();
    const issued = await service.issue("google");

    await expect(service.verify(issued.cookieValue, "google", "otro-state")).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("rechaza si el proveedor del query no coincide con el de la cookie", async () => {
    const service = buildStateService();
    const issued = await service.issue("google");

    await expect(service.verify(issued.cookieValue, "github", issued.state)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("rechaza cookies manipuladas o ausentes", async () => {
    const service = buildStateService();
    const issued = await service.issue("google");
    const tampered = `${issued.cookieValue.slice(0, -4)}xxxx`;

    await expect(service.verify(tampered, "google", issued.state)).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(service.verify(undefined, "google", issued.state)).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(service.verify(issued.cookieValue, "google", undefined)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("expira segun el TTL configurado", async () => {
    const instantExpired = buildStateService(-1);
    const issued = await instantExpired.issue("google");

    await expect(instantExpired.verify(issued.cookieValue, "google", issued.state)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("set/clear escriben la cookie acotada a /api/v1/auth/oauth", () => {
    const service = buildStateService();
    const jar: Record<string, string> = {};
    const reply = {
      setCookie: (name: string, value: string) => {
        jar[name] = value;
      },
      clearCookie: (name: string) => {
        delete jar[name];
      },
    } as unknown as FastifyReply;

    service.set(reply, "valor-firmado");
    expect(jar["oauth_st"]).toBe("valor-firmado");

    service.clear(reply);
    expect(jar["oauth_st"]).toBeUndefined();
  });
});
