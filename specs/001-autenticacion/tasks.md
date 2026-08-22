# Tasks 001 — Autenticación y Sesiones

> Regla: cada tarea es verificable de forma independiente y sigue test-first donde aplica.
> No se avanza a la siguiente si la anterior no compila, pasa sus tests y lint.

## Bloque A — Infraestructura de datos

- [x] **T1.** Setup Prisma en `apps/api`: dependencias, `prisma/schema.prisma` con datasource+generator, script `prisma:migrate`/`prisma:studio`, conexión singleton `PrismaService` (onModuleInit). _Verificar: `pnpm prisma migrate dev` crea BD vacía sin error._
- [x] **T2.** Modelo de datos §2 del plan: modelos `User`, `OauthAccount`, `Session`, `EmailToken` + extensión `citext`. Migración inicial aplicada. _Verificar: introspección muestra índices y únicos del plan._

## Bloque B — Primitivas de seguridad

- [ ] **T3.** `tokens.service.ts` con jose: firma/verificación access JWT HS256 (`JWT_SECRET`, TTL 15 m), margen de reloj 30 s. Tests unitarios de expiración y firma inválida.
- [ ] **T4.** `sessions.service.ts`: crear sesión, rotación con `replaced_by_hash`, detección de reuse → revocación de familia, expulsión al superar 10 sesiones. Tests unitarios cubriendo RF-7/RF-8 y regla de máximo.
- [ ] **T5.** Guards: `JwtAuthGuard` (Bearer), `OptionalAuthGuard`; filtro de excepciones global que responde `ApiErrorResponseSchema`. Test de integración de un endpoint dummy protegido.

## Bloque C — Flujos locales

- [ ] **T6.** `POST /register` + política argon2id + email de verificación encolado (BullMQ productor; worker temporal inline que consume en dev). Tests: RF-1, RF-2.
- [ ] **T7.** `POST /verify-email` y `POST /resend-verification` (tokens hasheados, un solo uso, 24 h). Tests RF-3.
- [ ] **T8.** `POST /login` + rate limit Redis 5/15 min por IP (throttler). Tests: RF-4, RF-5.
- [ ] **T9.** `POST /refresh` con cookie httpOnly + CSRF double-submit. Tests: RF-6, RF-7, RF-8.
- [ ] **T10.** `POST /logout`, `/logout-all`, `GET /me`. Tests RF-10.

## Bloque D — OAuth

- [ ] **T11.** Cliente OAuth genérico authorization-code (state+nonce firmado en cookie temporal): config Google y GitHub vía env. Redirects correctos verificados manualmente con credenciales dev.
- [ ] **T12.** Callback: verificación id_token Google vía JWKS; GitHub via API `/user`+`/user/emails`. Vinculación por email verificado o creación. Tests RF-9 con proveedor mockeado (nock).
- [ ] **T13.** Página frontend `/auth/callback` que recibe tokens, guarda access en memoria y redirige al feed vacío.

## Bloque E — Recuperación y cierre

- [ ] **T14.** `POST /forgot-password` (202 siempre) + `POST /reset-password` (revoca sesiones, notifica). Tests RF-11, RF-12.
- [ ] **T15.** Frontend completo: `/login`, `/register`, `/forgot-password`, `/reset-password` con react-hook-form + Zod, manejo de errores del contrato, estados de carga.
- [ ] **T16.** E2E Playwright flujo completo (usa Mailpit API para extraer tokens). Ejecutable con `pnpm e2e`.
- [ ] **T17.** Documentar en README de `apps/api` cómo probar todo localmente + variables env requeridas. Actualizar OpenAPI exportado y cliente Orval en web.

## Definition of Done de la spec

- [ ] Todas las tareas marcadas y sus criterios demostrados
- [ ] Criterios Gherkin de spec.md automatizados (unit/integración/e2e según plan §6)
- [ ] Cobertura módulo auth ≥ 80% · CI verde · contrato OpenAPI sin breaking changes vs v0
