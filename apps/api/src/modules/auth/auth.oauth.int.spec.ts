import { VersioningType } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import fastifyCookie from "@fastify/cookie";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ApiErrorResponseSchema } from "@redsocial/contracts";

import { AppModule } from "../../app.module";
import { PrismaService } from "../prisma/prisma.service";
import { OauthStateService } from "./services/oauth-state.service";
import { FakePrisma } from "../../testing/fake-prisma";

describe("GET /auth/oauth/:provider (integracion)", () => {
  let app: NestFastifyApplication;
  const prisma = new FakePrisma();

  beforeAll(async () => {
    process.env.GOOGLE_CLIENT_ID = "test-google-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-google-secret";
    process.env.GITHUB_CLIENT_ID = "test-github-id";
    process.env.GITHUB_CLIENT_SECRET = "test-github-secret";
    process.env.API_URL = "https://api.local";

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.register(fastifyCookie);
    app.setGlobalPrefix("api");
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
    delete process.env.API_URL;
    await app.close();
  });

  it("google: redirige al authorize endpoint con state+nonce y cookie firmada", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/auth/oauth/google");

    expect(res.status).toBe(302);
    const location = new URL(res.headers.location as string);
    expect(location.origin + location.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(location.searchParams.get("client_id")).toBe("test-google-id");
    expect(location.searchParams.get("response_type")).toBe("code");
    expect(location.searchParams.get("redirect_uri")).toBe(
      "https://api.local/api/v1/auth/oauth/google/callback",
    );
    const state = location.searchParams.get("state");
    const nonce = location.searchParams.get("nonce");
    expect(state).toBeTruthy();
    expect(nonce).toBeTruthy();

    const setCookie = (res.headers["set-cookie"] ?? []) as unknown as string[];
    const stateCookie = setCookie.find((c) => c.startsWith("oauth_st="));
    expect(stateCookie).toBeDefined();
    expect(stateCookie).toContain("HttpOnly");
    expect(stateCookie).toContain("Path=/api/v1/auth/oauth");

    // El handshake se cierra: la cookie verifica contra el ?state y devuelve el nonce.
    const cookieValue = stateCookie?.match(/oauth_st=([^;]+)/)?.[1] as string;
    const verified = await app
      .get(OauthStateService)
      .verify(decodeURIComponent(cookieValue), "google", state as string);
    expect(verified.nonce).toBe(nonce);
  });

  it("github: redirige sin nonce", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/auth/oauth/github");

    expect(res.status).toBe(302);
    const location = new URL(res.headers.location as string);
    expect(location.origin + location.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(location.searchParams.get("client_id")).toBe("test-github-id");
    expect(location.searchParams.get("scope")).toBe("read:user user:email");
    expect(location.searchParams.has("nonce")).toBe(false);
    expect(location.searchParams.get("state")).toBeTruthy();
  });

  it("proveedor desconocido responde 400 con el contrato de errores", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/auth/oauth/twitter");

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("proveedor_no_soportado");
    expect(ApiErrorResponseSchema.safeParse(res.body).success).toBe(true);
  });
});
