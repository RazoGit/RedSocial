# Tasks 001 â€” AutenticaciÃ³n y Sesiones

> Regla: cada tarea es verificable de forma independiente y sigue test-first donde aplica.
> No se avanza a la siguiente si la anterior no compila, pasa sus tests y lint.

## Bloque A â€” Infraestructura de datos

- [x] **T1.** Setup Prisma en `apps/api`: dependencias, `prisma/schema.prisma` con datasource+generator, script `prisma:migrate`/`prisma:studio`, conexiÃ³n singleton `PrismaService` (onModuleInit). _Verificar: `pnpm prisma migrate dev` crea BD vacÃ­a sin error._
- [x] **T2.** Modelo de datos Â§2 del plan: modelos `User`, `OauthAccount`, `Session`, `EmailToken` + extensiÃ³n `citext`. MigraciÃ³n inicial aplicada. _Verificar: introspecciÃ³n muestra Ã­ndices y Ãºnicos del plan._

## Bloque B â€” Primitivas de seguridad

- [x] **T3.** `tokens.service.ts` con jose: firma/verificaciÃ³n access JWT HS256 (`JWT_SECRET`, TTL 15 m), margen de reloj 30 s. Tests unitarios de expiraciÃ³n y firma invÃ¡lida.
- [x] **T4.** `sessions.service.ts`: crear sesiÃ³n, rotaciÃ³n con `replaced_by_hash`, detecciÃ³n de reuse â†’ revocaciÃ³n de familia, expulsiÃ³n al superar 10 sesiones. Tests unitarios cubriendo RF-7/RF-8 y regla de mÃ¡ximo.
- [x] **T5.** Guards: `JwtAuthGuard` (Bearer), `OptionalAuthGuard`; filtro de excepciones global que responde `ApiErrorResponseSchema`. Test de integraciÃ³n de un endpoint dummy protegido.

## Bloque C â€” Flujos locales

- [x] **T6.** `POST /register` + polÃ­tica argon2id + email de verificaciÃ³n encolado (BullMQ productor; worker temporal inline que consume en dev). Tests: RF-1, RF-2.
- [x] **T7.** `POST /verify-email` y `POST /resend-verification` (tokens hasheados, un solo uso, 24 h). Tests RF-3.
- [x] **T8.** `POST /login` + rate limit Redis 5/15 min por IP (throttler). Tests: RF-4, RF-5. _Nota: D8 ajustada — en vez de @nestjs/throttler se usa LoginRateLimiterService propio sobre ioredis porque RF-5 exige contar solo intentos FALLIDOS y resetear al acertar._
- [ ] **T9.** `POST /refresh` con cookie httpOnly + CSRF double-submit. Tests: RF-6, RF-7, RF-8.
- [ ] **T10.** `POST /logout`, `/logout-all`, `GET /me`. Tests RF-10.

## Bloque D â€” OAuth

- [ ] **T11.** Cliente OAuth genÃ©rico authorization-code (state+nonce firmado en cookie temporal): config Google y GitHub vÃ­a env. Redirects correctos verificados manualmente con credenciales dev.
- [ ] **T12.** Callback: verificaciÃ³n id_token Google vÃ­a JWKS; GitHub via API `/user`+`/user/emails`. VinculaciÃ³n por email verificado o creaciÃ³n. Tests RF-9 con proveedor mockeado (nock).
- [ ] **T13.** PÃ¡gina frontend `/auth/callback` que recibe tokens, guarda access en memoria y redirige al feed vacÃ­o.

## Bloque E â€” RecuperaciÃ³n y cierre

- [ ] **T14.** `POST /forgot-password` (202 siempre) + `POST /reset-password` (revoca sesiones, notifica). Tests RF-11, RF-12.
- [ ] **T15.** Frontend completo: `/login`, `/register`, `/forgot-password`, `/reset-password` con react-hook-form + Zod, manejo de errores del contrato, estados de carga.
- [ ] **T16.** E2E Playwright flujo completo (usa Mailpit API para extraer tokens). Ejecutable con `pnpm e2e`.
- [ ] **T17.** Documentar en README de `apps/api` cÃ³mo probar todo localmente + variables env requeridas. Actualizar OpenAPI exportado y cliente Orval en web.

## Definition of Done de la spec

- [ ] Todas las tareas marcadas y sus criterios demostrados
- [ ] Criterios Gherkin de spec.md automatizados (unit/integraciÃ³n/e2e segÃºn plan Â§6)
- [ ] Cobertura mÃ³dulo auth â‰¥ 80% Â· CI verde Â· contrato OpenAPI sin breaking changes vs v0
