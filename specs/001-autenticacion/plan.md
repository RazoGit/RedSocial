# Plan 001 — Autenticación y Sesiones

- Estado: Aprobado
- Spec: [spec.md](./spec.md)
- Stack de referencia: `docs/TECH_STACK.md` §10

## 1. Decisiones técnicas (ADRs inline)

| #   | Decisión                                                                                                                                  | Alternativa descartada             | Justificación                                                                                                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | OAuth **authorization code** implementado a mano (fetch al token endpoint)                                                                | Passport (passport-google-oauth20) | Estrategias de passport asumen Express; con Fastify generan fricción. Para 2 proveedores, flujo directo es menos código y cero dependencias conflictivas |
| D2  | JWT firmados/verificados con **jose** (HS256 local, JWKS para id_token de Google)                                                         | @nestjs/jwt (jsonwebtoken)         | jose es estándar WebCrypto, soporta JWKS remoto y rotación de claves; jsonwebtoken está en modo mantenimiento                                            |
| D3  | Hash de contraseñas con **argon2id**                                                                                                      | bcrypt                             | Recomendación OWASP 2024+; memoria dura anti-GPU                                                                                                         |
| D4  | Refresh token opaco (32 B aleatorio, hash SHA-256 en BD) + cookie httpOnly                                                                | Refresh = JWT                      | Opacos permiten revocación inmediata por fila y detección de reuse sin lógica criptográfica                                                              |
| D5  | Access token JWT **en cuerpo de respuesta**, guardado en memoria por el frontend (TanStack Query interceptor)                             | Access también en cookie           | Cookie doble (access+refresh) agranda superficie CSRF; access corto en memoria + refresh httpOnly es el equilibrio estándar SPA                          |
| D6  | CSRF: **double-submit cookie** (`csrf_token` legible + header `X-CSRF-Token`) solo en mutaciones autenticadas por cookie (refresh/logout) | Token sincronizado                 | Simple, sin estado servidor adicional                                                                                                                    |
| D7  | Sesiones en tabla Postgres `sessions` (no Redis) para MVP                                                                                 | Redis-only                         | Consultabilidad y auditoría simples; Redis se usa para rate-limit y cache de JWKS. Migrable después                                                      |
| D8  | Rate limit con **@nestjs/throttler + storage Redis**                                                                                      | En memoria                         | Necesario para múltiples instancias ya                                                                                                                   |

## 2. Modelo de datos v1 (Prisma)

```mermaid
erDiagram
    users ||--o{ oauth_accounts : "tiene"
    users ||--o{ sessions : "abre"
    users ||--o{ email_tokens : "solicita"

    users {
        uuid id PK
        citext email UK "único, case-insensitive"
        string password_hash "null si solo OAuth"
        boolean email_verified
        datetime created_at
        datetime updated_at
        datetime deleted_at "borrado blando futuro"
    }
    oauth_accounts {
        uuid id PK
        uuid user_id FK
        string provider "google|github"
        string provider_account_id UK_compuesto
        datetime created_at
    }
    sessions {
        uuid id PK
        uuid user_id FK
        string refresh_hash UK "sha256 del token"
        string user_agent
        string ip
        datetime expires_at
        datetime created_at
        datetime last_used_at
        datetime revoked_at "null = activa"
        string replaced_by_hash "rotación: familia"
    }
    email_tokens {
        uuid id PK
        uuid user_id FK
        string token_hash UK
        enum type "verify_email|password_reset"
        datetime expires_at
        datetime used_at
        datetime created_at
    }
```

Índices obligatorios: `sessions(user_id)`, `email_tokens(user_id,type)`; únicos según diagrama.
Migración inicial incluye `citext` extension para emails case-insensitive.

## 3. Flujos clave

### Login local → sesión

```
POST /auth/login {email,password}
→ valida argon2 · crea session(refresh_hash=sha256(R)) · Set-Cookie rt=R
→ res 200 { accessToken, expiresIn:900, csrfToken }
```

### Rotación (con detección de reuse)

```
POST /auth/refresh (cookie rt)
→ busca session por sha256(rt)
  ├─ activa y no expirada → marca replaced_by_hash=nuevo, crea nueva fila, Set-Cookie nuevo rt
  └─ revoked_at != null (reuse!) → revoca familia completa del usuario → 401
```

### OAuth (Google ejemplo)

```
GET /auth/oauth/google → redirect accounts.google.com (state+nonce en cookie temporal firmada)
GET /auth/oauth/google/callback?code&state
→ verifica state · intercambia code→tokens · verifica id_token contra JWKS
→ vincula/crea user+oauth_account por email verificado del proveedor → RF-6 → redirect frontend /auth/callback#access=...
```

## 4. Estructura de módulos NestJS

```
src/modules/auth/
├─ auth.module.ts
├─ auth.controller.ts        # rutas §6 spec
├─ auth.service.ts           # orquestación
├─ dto/                      # class-validator + swagger decorators
├─ strategies/               # google.oauth.ts, github.oauth.ts (clientes HTTP puros)
├─ guards/                   # JwtAuthGuard (verifica Bearer), CsrfGuard
├─ services/
│  ├─ tokens.service.ts      # jose sign/verify access
│  ├─ sessions.service.ts    # CRUD sesiones + rotación/reuse
│  └─ oauth.service.ts       # vinculación/creación usuarios
prisma/schema.prisma         # modelo §2
```

Prisma entra en esta fase como dependencia de `apps/api` (`@redsocial/api`).

## 5. Frontend (apps/web)

- Rutas: `/login`, `/register`, `/forgot-password`, `/reset-password`, `/auth/callback` (OAuth).
- Cliente API generado desde OpenAPI con **Orval** → hooks TanStack Query.
- Access token en memoria (`AuthStore`, Zustand); interceptor reintenta con `/refresh` al recibir 401 una sola vez.
- Formularios: react-hook-form + Zod (schemas compartidos de contracts cuando aplique).

## 6. Testing

| Nivel                   | Alcance                                                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Unit (Vitest)           | tokens.service (expiraciones, firma), sessions.service (reuse, expulsión LRU), políticas de contraseña                                  |
| Integración (Supertest) | cada endpoint §6 contra Postgres/Redis reales vía contenedores                                                                          |
| E2E (Playwright)        | registro→verificar(Mailpit API)→login→refresh→logout-all; login Google con usuario de prueba (mock server OIDC ligero o cuenta sandbox) |

## 7. Riesgos y mitigaciones

| Riesgo                                             | Mitigación                                                                         |
| -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Cookies detrás de proxy HTTPS en prod              | Configurar `trustProxy` + `cookie.secure=auto`; documentado para Fase 9            |
| Vinculación OAuth automática por email suplantable | Solo auto-vincular si proveedor reporta `email_verified=true`; si no, error guiado |
| Clock skew entre instancias                        | Validar exp con margen ±30 s en guards                                             |
| Emails en dev bloqueados                           | Mailpit captura todo; seed script imprime enlaces de verificación en consola       |
