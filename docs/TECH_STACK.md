# Stack Tecnológico — Análisis y Recomendaciones

> Proyecto: Red Social · Metodología: SDD (Spec-Driven Development)
> Fecha: agosto 2026 · Los límites de los planes gratuitos cambian; verifica antes de decidir.

## 1. Resumen ejecutivo

| Aspecto     | Tu elección              | Veredicto     | Recomendación                    | Servicio gratuito sugerido |
| ----------- | ------------------------ | ------------- | -------------------------------- | -------------------------- |
| Frontend    | Next.js + React + TS     | ✅ Mantener   | —                                | Vercel Hobby               |
| UI          | MUI + Tailwind           | ⚠️ Redundante | Elegir uno (ver §2)              | —                          |
| Backend     | NestJS + TS              | ✅ Mantener   | —                                | Render/Koyeb u Oracle Free |
| API         | REST inicial             | ✅ Mantener   | + OpenAPI → cliente tipado       | —                          |
| Tiempo real | WebSockets               | ✅ Mantener   | Socket.IO + adaptador Redis      | —                          |
| BD          | PostgreSQL               | ✅ Mantener   | —                                | Neon o Supabase            |
| ORM         | Prisma                   | ✅ Mantener   | Alternativa: Drizzle             | —                          |
| Cache       | Redis                    | ⚠️ Matizado   | Self-host o Redis Cloud (ver §8) | Redis Cloud 30 MB          |
| Archivos    | S3-compatible            | ✅ Mantener   | Cloudflare R2 (cero egress)      | R2: 10 GB gratis           |
| Auth        | OAuth/OIDC + JWT/cookies | ✅ Mantener   | Custom NestJS primero (ver §10)  | —                          |
| Jobs        | BullMQ + Redis           | ✅ Mantener   | Requiere conexión persistente    | Con el Redis elegido       |
| Deploy      | Docker                   | ✅ Mantener   | Multi-stage + compose            | Oracle Cloud Always Free   |
| CI/CD       | GitHub Actions           | ✅ Mantener   | —                                | Gratis repos públicos      |
| Monitoreo   | Sentry + OpenTelemetry   | ✅ Mantener   | + Grafana Cloud para OTel        | Ambos tienen free tier     |

**Conclusión:** el stack es sólido y coherente. Solo hay **una decisión que revisar de verdad (MUI + Tailwind)** y **dos matices operativos (hosting de Redis y estrategia de despliegue gratuito)**.

---

## 2. UI: MUI + Tailwind ⚠️ — la única decisión que recomiendo cambiar

> **✅ DECIDIDO (2026-08-21):** se adopta **Tailwind CSS v4 + shadcn/ui**. Ver ADR [`docs/adr/0001-ui-tailwind-shadcn.md`](./adr/0001-ui-tailwind-shadcn.md). El resto de esta sección se conserva como contexto de las alternativas.

El problema no es que "no funcione", es que **resuelven lo mismo dos veces**:

- MUI trae su propio sistema de estilos (Emotion/theme) y utilidades (`sx`, Grid, Stack).
- Tailwind trae sus propias utilidades de layout, spacing, responsive.
- Juntos: conflicto de CSS reset (preflight vs CssBaseline), bundle más grande, dos formas de hacer todo y equipo confundido.

### Opción A — Solo MUI (recomendada si priorizas velocidad)

Componentes completos y accesibles desde el día 1, theming potente (modo oscuro incluido), ideal para un MVP de red social rápido. Layout con `Grid`, `Stack`, `Box`.

### Opción B — Tailwind + shadcn/ui (recomendada si priorizas identidad visual propia)

Componentes copy-paste sobre Radix UI que personalizas 100%. Look menos "Material". Curva algo mayor pero resultado más distintivo para una red social.

### Opción C — Híbrido (si insisten en ambos)

Posible: desactivar `preflight` de Tailwind o usar `important: '#root'`; MUI para componentes complejos (DataGrid, modales), Tailwind solo para utilidades de layout. Funciona, pero exige disciplina documentada en la constitución SDD para no duplicar estilos.

**Mi recomendación: Opción A para el MVP.** Reevaluar en post-MVP si el diseño requiere identidad propia.

---

## 3. Frontend — Next.js + React + TypeScript ✅

Elección correcta. Detalles recomendados:

- **Next.js 15+ con App Router**, Server Components para el feed inicial (SEO + TTFB), Client Components para interacciones.
- **React 19** con Suspense y transiciones.
- Estado servidor: **TanStack Query** (evita reinventar cache de API).
- Cliente API generado desde el OpenAPI del backend con **Orval** o `openapi-typescript` (contrato único, cero drift).
- Validación compartida: esquemas **Zod** reutilizados front/back (monorepo).

Alternativas consideradas: Remix/RR7 (menos ecosistema), Astro (no encaja: es una app, no un sitio de contenido). **No cambiar.**

---

## 4. Backend — NestJS + TypeScript ✅

Correcto para este alcance: módulos, DI, guardas, interceptores, gateways WebSocket nativos, integración oficial con Prisma y BullMQ.

Detalles recomendados:

- Usar **Fastify como adapter** en vez de Express (rendimiento, menor memoria).
- **@nestjs/swagger** para generar OpenAPI desde los DTOs (fuente de verdad del contrato REST).
- Config con **class-validator** + `.env` validado al boot (fail-fast).
- Versionado de API (`/api/v1`) desde el día 1.

Alternativas: Fastify solo (más ligero, menos estructura), Hono (excelente pero más "hazlo tú"), tRPC (acopla front/back al mismo proceso de tipos; bonito en monorepo pero cierra la puerta a apps nativas futuras consumiendo REST). **NestJS se mantiene.**

---

## 5. API REST inicial ✅

Estrategia recomendada:

1. REST versionado `/v1` documentado con Swagger UI.
2. Contrato OpenAPI exportado en CI; **breaking changes bloquean el merge**.
3. Cliente TS autogenerado para Next.js (Orval + TanStack Query).
4. Cuando haya clientes móviles/nativos, evaluar **BFF** (route handlers de Next) antes que GraphQL.

---

## 6. Tiempo real — WebSockets ✅

- **Socket.IO vía Gateways de NestJS**: rooms por usuario, reconexión automática.
- **@socket.io/redis-adapter** desde el inicio: permite escalar a varias réplicas sin reescribir nada.
- Para notificaciones "fire-and-forget", SSE es suficiente; pero como ya tendrás Socket.IO, un solo canal simplifica.
- Autenticar el handshake del WS con el JWT (guarda en el gateway), nunca confiar en el socket conectado.

---

## 7. BD + ORM — PostgreSQL + Prisma ✅

- PostgreSQL es la elección correcta (relacional + JSONB + full-text search con `tsvector` para búsqueda de usuarios/posts en MVP sin Elastic).
- Prisma: gran DX, migraciones claras. Alternativa moderna: **Drizzle** (SQL-like, más ligero en cold-starts serverless). Para un backend NestJS de larga vida, **Prisma se mantiene** sin penalización.
- Pool: usar PgBouncer (o el pooler de Neon/Supabase) cuando haya múltiples instancias.
- Índices desde el día 1 en claves del grafo social (`follows(followerId, followingId)` único, índices inversos para el feed).

BD gratuita:

- **Neon Free** (~0.5 GB, branching, autosuspend): ideal para el backend principal.
- **Supabase Free** (500 MB + auth + storage + realtime como bonus): alternativa "todo en uno".
- Dev local: contenedor `postgres:17` con volumen.

---

## 8. Cache — Redis ⚠️ matiz operativo

Tu elección es correcta; el matiz es **dónde alojarlo** porque BullMQ necesita conexión TCP persistente:

| Opción                           | BullMQ                               | Coste | Nota                                                                         |
| -------------------------------- | ------------------------------------ | ----- | ---------------------------------------------------------------------------- |
| **Self-host en tu VPS (Docker)** | ✅ Ideal                             | $0    | Recomendada si usas Oracle Free (§12-A)                                      |
| **Redis Cloud Free (30 MB)**     | ✅ Compatible                        | $0    | Suficiente para cache + colas pequeñas                                       |
| Upstash Free                     | ⚠️ Posible pero caro en comandos/día | $0    | Diseñado para HTTP/serverless; polling de colas quema la cuota (10k cmd/día) |
| Valkey (fork OSS)                | ✅                                   | $0    | Alternativa licencia, mismo protocolo                                        |

**Recomendación:** self-host en Docker junto al backend (un solo proveedor que gestionar). Usos: sesiones/refresh tokens, caché de feed, rate-limiting, pub/sub de Socket.IO, colas BullMQ.

---

## 9. Archivos — S3-compatible ✅ → Cloudflare R2

- **Prod: Cloudflare R2** — 10 GB gratis, API S3 idéntica y, lo decisivo para una red social llena de imágenes: **egress $0** (B2 también da 10 GB pero cobra egress; S3 real es carísimo en tráfico).
- **Dev/local: MinIO** en docker-compose (misma API S3).
- Patrón: **URLs pre-firmadas** generadas por el backend (`PUT` directo navegador→bucket), validando tipo/tamaño por cola previa; procesamiento posterior (thumbnails, blurhash) en worker BullMQ.
- Servir imágenes vía dominio público de R2 (CDN de Cloudflare incluido).

---

## 10. Auth — OAuth/OIDC + JWT/cookies ✅ con estrategia clara

Dos caminos válidos; recomiendo el primero para aprender/control total:

### Camino A (recomendado MVP): módulo propio en NestJS

- Login social con **Passport**: estrategias Google + GitHub (OAuth2/OIDC).
- Sesión: **JWT de acceso (15 min) + refresh token rotado** en cookie `httpOnly`+`Secure`+`SameSite=Lax`; refresh hasheado en BD/Redis para revocación.
- CSRF double-submit para mutaciones cookie-based; rate limit en login.
- Coste: $0, control total, excelente aprendizaje. Riesgo: eres responsable de la seguridad → checklist OWASP en la fase de hardening.

### Camino B: proveedor de identidad gestionado

- **Zitadel** (OSS, free tier generoso) o Keycloak self-host (pesado ~1 GB RAM); gestionados: **Auth0** (25k MAU), **Clerk** (10k MAU), Firebase Auth, Supabase Auth.
- Útil si quieres SSO empresarial/MFA sin mantener código de identidad.

---

## 11. Jobs — BullMQ + Redis ✅

Perfecto con NestJS (`@nestjs/bullmq`). Colas iniciales:

- `email`: verificación, bienvenida, notificaciones digest (SMTP dev: **Mailpit** en Docker).
- `media`: thumbnails, compresión, blurhash.
- `feed`: fan-out de posts a seguidores (híbrido push/pull).
- `cleanup`: expiración de tokens, borrados blandos.

Patrones: jobs idempotentes, reintentos con backoff exponencial, DLQ (cola de fallidos) y alerta a Sentry.

---

## 12. Despliegue — Docker ✅ y las rutas gratuitas reales

Docker multi-stage (builder + runner distroless/alpine), healthchecks, `docker-compose.prod.yml`. El CI construye y publica imágenes en GHCR (gratis).

### Opción A — Todo-en-uno en Oracle Cloud Always Free ⭐ (mi recomendación)

VM ARM Ampere **4 OCPU / 24 GB RAM / 200 GB** gratis _para siempre_ (no trial). Corres ahí: backend, workers, Redis, MinIO, Caddy/Traefik (HTTPS automático) con docker-compose. Neon/R2 quedan como servicios externos o migras todo dentro.
⚠️ Riesgos conocidos: alta de cuenta con tarjeta y disponibilidad regional variable de instancias ARM; ten plan B (Opción B).

### Opción B — Mosaico de SaaS gratuitos (sin VPS)

| Pieza                | Servicio                                  | Límite aproximado                                                              |
| -------------------- | ----------------------------------------- | ------------------------------------------------------------------------------ |
| Frontend (Next.js)   | **Vercel Hobby**                          | Generoso; uso no comercial                                                     |
| Backend NestJS       | **Koyeb Free** o **Render Free**          | Koyeb: 1 servicio siempre activo; Render: duerme tras inactividad (cold start) |
| PostgreSQL           | **Neon Free**                             | ~0.5 GB, autosuspend                                                           |
| Redis                | **Redis Cloud Free**                      | 30 MB                                                                          |
| Archivos             | **Cloudflare R2**                         | 10 GB, egress $0                                                               |
| Errores              | **Sentry Developer**                      | ~5k errores/mes, session replays                                               |
| Métricas/trazas/logs | **Grafana Cloud Free**                    | ~10k series, decenas de GB logs/traces                                         |
| Email transaccional  | **Brevo** (300/día) o **Resend** (3k/mes) | —                                                                              |
| Uptime               | **UptimeRobot**                           | 50 checks                                                                      |

⚠️ En Render/Koyeb/Vercel el filesystem es efímero → refuerza por qué archivos van a R2 y colas/cache a Redis externo.

### CI/CD — GitHub Actions ✅

Gratis ilimitado en repos públicos; 2.000 min/mes en privados. Pipeline: lint → typecheck → unit/e2e → build → imagen GHCR → deploy SSH (Opción A) o webhook/`vercel deploy` (Opción B).

---

## 13. Monitoreo — Sentry + OpenTelemetry ✅

División limpia:

- **Sentry**: errores + performance + Session Replay (front y back, SDKs oficiales). Release health por commit.
- **OpenTelemetry**: instrumentación única (`@opentelemetry/auto-instrumentations`) exportando trazas/métricas/logs a **Grafana Cloud Free** vía OTLP. Correlacionar `trace_id` entre Next.js ↔ NestJS ↔ workers.
- Alertas: Sentry → Discord/Slack; Grafana Alerts → email.

---

## 14. Decisiones complementarias que faltaban en tu lista

| Aspecto       | Recomendación                                                      | Por qué                                                             |
| ------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Estructura    | **Monorepo pnpm + Turborepo**                                      | Tipos/esquemas Zod compartidos, un solo PR para cambios cross-stack |
| Tests         | **Vitest** (unit) + **Supertest** (API) + **Playwright** (e2e)     | Estándares actuales, rápidos                                        |
| Calidad       | ESLint flat + Prettier + Husky + commitlint (Conventional Commits) | Gates en CI, historial limpio                                       |
| Contrato      | OpenAPI exportado + cliente Orval                                  | Front siempre sincronizado con backend                              |
| Email en dev  | **Mailpit**                                                        | Captura todo sin enviar spam real                                   |
| Reverse proxy | **Caddy**                                                          | HTTPS automático, config mínima                                     |
| Feature flags | Variables de entorno simples al inicio                             | Evitar dependencia temprana tipo Unleash                            |

---

## 15. Conclusión

1. **Cambia**: decide UI — MUI solo (recomendado para MVP) o Tailwind + shadcn/ui. No ambos por defecto.
2. **Matiza**: Redis self-host o Redis Cloud (no Upstash para BullMQ); archivos en R2; despliegue Oracle Free (A) o mosaico SaaS (B).
3. **Todo lo demás se mantiene tal cual**: es un stack moderno, coherente y con ruta gratuita completa hasta producción.
