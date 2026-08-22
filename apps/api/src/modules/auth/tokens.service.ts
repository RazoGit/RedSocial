import { Injectable } from "@nestjs/common";
import { SignJWT, jwtVerify } from "jose";

export interface AccessTokenPayload {
  sub: string;
  email?: string;
}

const JWT_ISSUER = "redsocial-api";
const JWT_AUDIENCE = "redsocial-web";

/**
 * Emision y verificacion de access tokens JWT (HS256, TTL 15 m por defecto,
 * tolerancia de reloj de 30 s para verificar expiracion).
 */
@Injectable()
export class TokensService {
  private readonly secretKey: Uint8Array;
  private readonly accessTtl: string;

  constructor() {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 16) {
      throw new Error("JWT_SECRET no esta definido o es demasiado corto (minimo 16 caracteres)");
    }
    this.secretKey = new TextEncoder().encode(secret);
    this.accessTtl = process.env.JWT_ACCESS_TTL ?? "15m";
  }

  async signAccessToken(payload: AccessTokenPayload): Promise<string> {
    return new SignJWT({ email: payload.email })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(payload.sub)
      .setIssuedAt()
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setExpirationTime(this.accessTtl)
      .sign(this.secretKey);
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    const { payload } = await jwtVerify(token, this.secretKey, {
      algorithms: ["HS256"],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      clockTolerance: "30s",
    });
    return payload as unknown as AccessTokenPayload;
  }

  /** TTL del access token en segundos (para expiresIn de las respuestas). */
  get accessTtlSeconds(): number {
    const match = /^(\d+)([smh])$/.exec(this.accessTtl);
    if (!match) throw new Error(`JWT_ACCESS_TTL invalido: ${this.accessTtl}`);
    const value = Number(match[1]);
    const unit = match[2];
    const factor = unit === "s" ? 1 : unit === "m" ? 60 : 3600;
    return value * factor;
  }
}
