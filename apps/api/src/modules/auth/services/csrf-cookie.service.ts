import { Injectable } from "@nestjs/common";
import type { FastifyReply } from "fastify";

/**
 * Cookie legible por JS para el patron CSRF double-submit (D6):
 * el cliente devuelve su valor en el header X-CSRF-Token y el
 * servidor compara ambos en cada mutacion autenticada por cookie.
 */
export const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_COOKIE_PATH = "/api/v1/auth";
const CSRF_COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60;

@Injectable()
export class CsrfCookieService {
  set(reply: FastifyReply, csrfToken: string): void {
    reply.setCookie(CSRF_COOKIE_NAME, csrfToken, {
      httpOnly: false,
      path: CSRF_COOKIE_PATH,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: CSRF_COOKIE_MAX_AGE_S,
    });
  }

  clear(reply: FastifyReply): void {
    reply.clearCookie(CSRF_COOKIE_NAME, {
      path: CSRF_COOKIE_PATH,
    });
  }
}
