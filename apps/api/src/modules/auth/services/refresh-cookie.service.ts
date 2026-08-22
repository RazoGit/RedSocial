import { Injectable } from "@nestjs/common";
import type { FastifyReply } from "fastify";

/**
 * Cookie de refresh token segun RF-6 del spec 001:
 * httpOnly, Secure en produccion, SameSite=Lax, limitada a /api/v1/auth.
 */
export const REFRESH_COOKIE_NAME = "rt";
const REFRESH_COOKIE_PATH = "/api/v1/auth";
const REFRESH_COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60;

@Injectable()
export class RefreshCookieService {
  set(reply: FastifyReply, refreshToken: string): void {
    reply.setCookie(REFRESH_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      path: REFRESH_COOKIE_PATH,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: REFRESH_COOKIE_MAX_AGE_S,
    });
  }

  clear(reply: FastifyReply): void {
    reply.clearCookie(REFRESH_COOKIE_NAME, {
      path: REFRESH_COOKIE_PATH,
    });
  }
}
