# @redsocial/api

API REST de RedSocial construida con **NestJS 11 sobre Fastify**, Prisma ORM y PostgreSQL.
Implementa las specs:

- [`001-autenticacion`](../../specs/001-autenticacion/spec.md) ✅ — registro local con verificación por email, login con rate limiting, refresh rotatorio, logout, OAuth (Google/GitHub) y recuperación de contraseña.
- [`002-usuarios-perfiles`](../../specs/002-usuarios-perfiles/spec.md) ✅ — perfil propio (username, nombre, bio, privacidad), avatar con procesamiento sharp, perfil público con cache Redis.
- [`004-posts`](../../specs/004-posts/spec.md) ✅ — CRUD de posts con imágenes, feed propio paginado cursor-based.
- [`005-social-graph`](../../specs/005-social-graph/spec.md) ✅ — follow/unfollow, feed principal cronológico con fan-out Redis (BullMQ) y fallback a Postgres.
- [`006-likes-comentarios`](../../specs/006-likes-comentarios/spec.md) ✅ — likes/unlikes y comentarios anidados (1 nivel) con contadores atómicos.

## Requisitos

- Node ≥ 22 y pnpm 10
- Docker Desktop (PostgreSQL 17, Redis 7, Mailpit)

## Puesta en marcha

```bash
# Desde la raíz del monorepo
docker compose up -d postgres redis mailpit
pnpm install
cp .env.example apps/api/.env          # ajusta si es necesario
pnpm --filter @redsocial/api prisma:migrate
pnpm dev                               # API en :4000 y web en :3000
```

## Variables de entorno (`apps/api/.env`)

| Variable                       | Obligatoria | Default (dev)                                                             | Uso                                                                                    |
| ------------------------------ | ----------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `DATABASE_URL`                 | Sí          | `postgresql://redsocial:redsocial@localhost:5432/redsocial?schema=public` | PostgreSQL via Prisma                                                                  |
| `REDIS_URL`                    | Sí          | `redis://localhost:6379`                                                  | BullMQ (emails) y rate limiter de login                                                |
| `JWT_SECRET`                   | Sí          | —                                                                         | Firma HS256 de los access tokens (mínimo 32 caracteres)                                |
| `JWT_ACCESS_TTL`               | No          | `15m`                                                                     | Vida del access token                                                                  |
| `PORT`                         | No          | `4000`                                                                    | Puerto HTTP                                                                            |
| `APP_URL`                      | No          | `http://localhost:3000`                                                   | Base de los links de emails y callback OAuth                                           |
| `SMTP_HOST` / `SMTP_PORT`      | No          | `localhost:1025`                                                          | Mailpit en dev                                                                         |
| `MAIL_FROM`                    | No          | `dev@redsocial.local`                                                     | Remitente de los correos                                                               |
| `EMAIL_DISABLED`               | No          | `false`                                                                   | `true` desactiva cola SMTP (usado en tests unitarios)                                  |
| `GOOGLE_CLIENT_ID` / `_SECRET` | Para OAuth  | —                                                                         | Credenciales de Google Cloud (redirect: `{API_URL}/api/v1/auth/oauth/google/callback`) |
| `GITHUB_CLIENT_ID` / `_SECRET` | Para OAuth  | —                                                                         | Credenciales de GitHub OAuth App                                                       |

> Sin credenciales OAuth configuradas, los endpoints `/auth/oauth/:provider` responden 503;
> el resto del módulo funciona igual.

## Probar todos los flujos manualmente

La UI web ([apps/web](../web)) cubre estos flujos; también puedes hacerlo por HTTP.
Los correos nunca salen a internet: quedan atrapados en **Mailpit → http://localhost:8025**.

### 1. Registro + verificación de email (RF-1..RF-3)

```bash
curl -X POST http://localhost:4000/api/v1/auth/register \
  -H "content-type: application/json" \
  -d '{"email":"tu@email.com","password":"ContrasenaSegura1"}'
# -> 201 { id, email, emailVerified: false }
```

Abre Mailpit, copia el token del enlace `verify-email?token=...` y confírmalo:

```bash
curl -X POST http://localhost:4000/api/v1/auth/verify-email \
  -H "content-type: application/json" -d '{"token":"<token>"}'
# -> 200 { accessToken, expiresIn, csrfToken } + Set-Cookie rt (httpOnly)
```

Reenvío de verificación: `POST /auth/resend-verification` con `{ "email" }` (siempre 202).

### 2. Login, sesión y rate limit (RF-4, RF-5)

```bash
curl -i -c cookies.txt -X POST http://localhost:4000/api/v1/auth/login \
  -H "content-type: application/json" \
  -d '{"email":"tu@email.com","password":"ContrasenaSegura1"}'
```

- 5 fallos consecutivos por IP bloquean 15 minutos (solo cuentan intentos fallidos).
- Login correcto resetea el contador.

### 3. Refresh rotatorio con CSRF (RF-6..RF-8)

```bash
CSRF=$(grep csrf_token cookies.txt | awk '{print $NF}')
curl -b cookies.txt -X POST http://localhost:4000/api/v1/auth/refresh \
  -H "X-CSRF-Token: $CSRF"
```

Cada refresh rota la cookie `rt`; reutilizar una ya usada revoca toda la familia.

### 4. Perfil y logout (RF-10)

```bash
curl http://localhost:4000/api/v1/auth/me -H "Authorization: Bearer <accessToken>"
curl -b cookies.txt -H "X-CSRF-Token: $CSRF" -X POST http://localhost:4000/api/v1/auth/logout
curl -b cookies.txt -H "X-CSRF-Token: $CSRF" -X POST http://localhost:4000/api/v1/auth/logout-all
```

### 5. Recuperación de contraseña (RF-11, RF-12)

```bash
curl -X POST http://localhost:4000/api/v1/auth/forgot-password \
  -H "content-type: application/json" -d '{"email":"tu@email.com"}'   # siempre 202
# Token desde Mailpit (enlace reset-password?token=...), valido 1 h:
curl -X POST http://localhost:4000/api/v1/auth/reset-password \
  -H "content-type: application/json" \
  -d '{"token":"<token>","password":"NuevaContrasena1"}'
```

El restablecimiento revoca todas las sesiones y notifica por correo.

### 6. OAuth (RF-9)

Configura credenciales reales en `.env`, visita
`http://localhost:4000/api/v1/auth/oauth/google` (o `/github`) en el navegador:
el callback redirige a `{APP_URL}/auth/callback#access=...&csrf=...&expires_in=...`.

## Tests

```bash
pnpm --filter @redsocial/api test             # unitarios + integración (Vitest)
pnpm --filter @redsocial/web e2e              # flujo completo con Playwright (levanta API y web)
```

Los tests de integración levantan la app en memoria (supertest); requieren Docker arriba.
El E2E extrae los tokens de verificación desde la API de Mailpit automáticamente.

## Contrato OpenAPI

- Explorador: <http://localhost:4000/docs>
- Exportar el JSON versionado del contrato (lo consume el cliente Orval del frontend):

```bash
pnpm --filter @redsocial/api openapi:export   # -> packages/contracts/openapi.json
pnpm --filter @redsocial/web generate:api     # -> apps/web/src/lib/generated/api.ts
```

## Estructura

```text
apps/api/src/
├── common/            # filtros de excepciones, pipes de validación Zod
├── config/            # entorno
├── modules/
│   ├── auth/          # controlador, servicio, DTOs, guards, estrategias OAuth
│   │   └── services/  # tokens, sesiones, passwords, CSRF, rate limit, OAuth
│   ├── email/         # productor BullMQ + worker SMTP inline de dev
│   ├── health/        # liveness/readiness
│   ├── posts/         # CRUD posts, media, feed (spec 004)
│   │   └── services/  # post media worker, pagination
│   ├── follows/       # follow/unfollow, feed principal, fan-out (spec 005)
│   │   └── services/  # feed service, feed cache Redis, fan-out worker
│   ├── likes/         # like/unlike con contadores atómicos (spec 006)
│   ├── comments/      # comentarios anidados (1 nivel) paginados (spec 006)
│   └── users/         # perfil propio/público, avatar con presign, username
│       └── services/  # username, media worker, avatar, cache, storage
└── prisma/            # schema.prisma y migraciones (en prisma/)
```
