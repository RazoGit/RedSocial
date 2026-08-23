import { VersioningType, type INestApplication } from "@nestjs/common";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../../app.module";
import { PrismaService } from "../prisma/prisma.service";
import { TokensService } from "./tokens.service";
import { FakePrisma } from "../../testing/fake-prisma";

describe("AuthController /auth/me (integracion)", () => {
  let app: INestApplication;
  const prisma = new FakePrisma();

  beforeAll(async () => {
    await prisma.user.create({ data: { email: "int@example.com", passwordHash: "h" } });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleRef.createNestApplication<INestApplication>(new FastifyAdapter());
    app.setGlobalPrefix("api");
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("rechaza sin token con la forma del contrato de errores", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/auth/me");

    expect(res.status).toBe(401);
    expect(res.body.statusCode).toBe(401);
    expect(typeof res.body.message).toBe("string");
    expect(res.body.path).toBe("/api/v1/auth/me");
    expect(typeof res.body.timestamp).toBe("string");
  });

  it("devuelve el perfil publico con un Bearer valido", async () => {
    const tokens = app.get(TokensService);
    const token = await tokens.signAccessToken({
      sub: prisma.users[0].id,
      email: prisma.users[0].email,
    });

    const res = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: prisma.users[0].id,
      email: "int@example.com",
      emailVerified: false,
    });
  });

  it("deja /health publica pese al guard global", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});
