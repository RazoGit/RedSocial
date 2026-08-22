# Roadmap — Red Social (basado en SDD)

> Metodología: **SDD — Spec-Driven Development**. Cada funcionalidad se especifica, planifica y descompone en tareas _antes_ de escribir código.
> Stack detallado y justificación: ver [`docs/TECH_STACK.md`](./TECH_STACK.md).

---

## 0. Metodología SDD

### Flujo por cada funcionalidad (ciclo obligatorio)

```
1. SPEC    → specs/NNN-funcionalidad/spec.md     (qué y por qué; requisitos, criterios EARS/Gherkin)
2. PLAN    → specs/NNN-funcionalidad/plan.md      (cómo; arquitectura, contratos API, modelo de datos)
3. TASKS   → specs/NNN-funcionalidad/tasks.md     (lista verificable de tareas con tests primero)
4. BUILD   → implementación tarea por tarea
5. VERIFY  → checklist del spec + CI verde + review
```

### Reglas de la constitución del proyecto

1. Ninguna feature entra a `main` sin spec aprobada y tareas completadas.
2. Los contratos OpenAPI son la única fuente de verdad front/back.
3. Todo endpoint público: validación de DTO + test + rate limit.
4. Cobertura mínima: 70% backend, 60% frontend; e2e para flujos críticos (auth, post, follow).
5. Seguridad por defecto: cookies httpOnly, helmet, CORS estricto, secrets nunca en el repo.

### Estructura del monorepo

```
RedSocial/
├─ apps/
│  ├─ web/        # Next.js + MUI
│  ├─ api/        # NestJS (REST + WS)
│  └─ workers/    # NestJS standalone (BullMQ consumers)
├─ packages/
│  ├─ contracts/  # Zod schemas + tipos compartidos + cliente Orval
│  └─ config/     # eslint/tsconfig/prettier compartidos
├─ docs/          # este roadmap, ADRs
├─ specs/         # SDD: NNN-funcionalidad/{spec,plan,tasks}.md
└─ docker-compose.yml / docker-compose.prod.yml
```

---

## Visión del MVP

Red social donde el usuario: se registra (email/social login), crea perfil con avatar, publica posts con imágenes, sigue a otros usuarios, ve un feed cronológico de seguidos, da likes y comenta, y recibe notificaciones en tiempo real.

Fuera del MVP (post-lanzamiento): mensajería directa, stories, trending/explorar, apps nativas.

---

## FASE 0 — Cimientos (Semana 1)

**Objetivo:** repo operativo con CI y entorno dev reproducible.

- [x] Git init, monorepo pnpm + Turborepo, workspace limpio
- [x] Tooling: ESLint flat, Prettier, Husky, lint-staged, commitlint
- [x] `docker-compose.yml` dev: PostgreSQL 17, Redis 7, MinIO, Mailpit
- [x] Decisión UI documentada (ADR 0001: **Tailwind v4 + shadcn/ui**)
- [x] CI base GitHub Actions: lint + typecheck + build en PRs
- [x] Constitución SDD versionada: [`docs/CONSTITUTION.md`](./CONSTITUTION.md)

**Criterio de salida (cumplido):** `pnpm i` + `docker compose up -d` levantan el entorno; lint+typecheck+build verificados localmente; CI ejecutará lo mismo en cada PR al conectar el remoto.

## FASE 1 — Especificación del núcleo (Semana 2)

**Objetivo:** specs 001–002 completas antes de codear features.

- [x] `specs/001-autenticacion/spec.md` (registro, login social Google/GitHub, refresh rotación, logout, recuperación)
- [x] `specs/001-autenticacion/{plan,tasks}.md` — incluye modelo de datos v1 completo (ERD Prisma)
- [x] `specs/002-usuarios-perfiles/spec.md` (perfil, avatar, edición, privacidad básica)
- [x] Contrato OpenAPI v0 + health checks verificados (`/api/v1/health`, `/api/v1/ready`, JSON en `/docs/openapi.json`)
- [x] Scaffold NestJS (Fastify) ✅ + scaffold Next.js ✅ · paquetes `packages/contracts` (Zod) y `packages/config` creados

**Criterio de salida:** specs revisadas; swagger UI sirve contrato v0. **→ CUMPLIDO. Siguiente: Fase 2 (implementar spec 001).**

## FASE 2 — Autenticación (Semanas 2–3) · spec 001

- [ ] Módulo auth: registro local (hash argon2), OAuth Google/GitHub
- [ ] JWT acceso 15 min + refresh rotado en Redis, cookies httpOnly/SameSite
- [ ] Guards, decorators `@CurrentUser()`, rate limit login (`@nestjs/throttler` + store Redis)
- [ ] Tests unit + e2e Supertest del flujo completo
- [ ] Front: páginas login/registro/callback OAuth, manejo de sesión con TanStack Query, middleware rutas protegidas

**Criterio de salida:** e2e Playwright: registro→login→refresh→logout verde en CI.

## FASE 3 — Perfiles y archivos (Semana 3–4) · spec 002

- [ ] CRUD perfil + subida avatar vía URL pre-firmada (MinIO local, R2-compatible)
- [ ] Worker BullMQ: thumbnail + blurhash del avatar
- [ ] Front: página perfil, editor, upload con progreso
- [ ] Spec 003-posts redactada al cerrar esta fase

**Criterio de salida:** avatar subido aparece optimizado en <5 s; spec 003 aprobada.

## FASE 4 — Posts y contenido (Semanas 4–5) · spec 003

- [ ] Posts CRUD (texto ≤500 chars, hasta 4 imágenes), borrado blando
- [ ] Media: pre-firmados, validación MIME/tamaño, worker thumbnails
- [ ] Feed propio ("mis posts") paginado cursor-based
- [ ] Front: composer, detalle de post, grid de perfil, infinite scroll

## FASE 5 — Grafo social y feed (Semanas 5–6) · spec 004

- [ ] Follow/unfollow (único compuesto, contadores atómicos)
- [ ] Feed home cronológico de seguidos: lectura desde caché Redis (lists por usuario), fallback a Postgres
- [ ] Fan-out en worker BullMQ (push a followers con cap; pull para cuentas grandes)
- [ ] Front: feed principal, seguir/dejar de seguir optimista
- [ ] Spec 005-interacciones redactada

## FASE 6 — Likes y comentarios (Semana 6–7) · spec 005

- [ ] Like/unlike idempotente + contador
- [ ] Comentarios anidados 1 nivel, paginados
- [ ] Front: interacciones optimistas, sección comentarios

## FASE 7 — Tiempo real (Semana 7–8) · spec 006

- [ ] Gateway Socket.IO autenticado con JWT, rooms por usuario, adaptador Redis
- [ ] Notificaciones: like/comentario/follow → persistencia + emisión WS + badge
- [ ] Presence básica (online/offline vía Redis TTL)
- [ ] Front: campana con badge, toasts, lista notificaciones

**Criterio de salida:** acción en dispositivo A notifica en B en <1 s.

## FASE 8 — Observabilidad y hardening (Semana 8–9)

- [ ] Sentry SDK web/api/workers + source maps en CI
- [ ] OpenTelemetry auto-instrumentación → OTLP Grafana Cloud; trace_id en logs (pino)
- [ ] Checklist OWASP: headers helmet, CORS allowlist, CSRF cookie-mutations, límites de tamaño, dependabot + `pnpm audit` en CI
- [ ] Load test básico k6 en feed y login
- [ ] Búsqueda usuarios/posts con full-text Postgres (MVP suficiente)

## FASE 9 — Despliegue (Semanas 9–10)

- [ ] Dockerfiles multi-stage (web standalone, api, workers) no-root + healthchecks
- [ ] `docker-compose.prod.yml`: api + workers + redis + caddy (TLS automático)
- [ ] Infra elegida según TECH_STACK §12: **A)** Oracle Cloud Always Free (todo-en-uno) o **B)** Vercel + Koyeb/Render + Neon + Redis Cloud + R2
- [ ] CD GitHub Actions: build/test → push GHCR → deploy SSH o proveedor
- [ ] Entornos: preview (PRs) y producción; backups Neon/snapshots; UptimeRobot

**Criterio de salida:** URL pública HTTPS, deploy automático desde `main`, Sentry reportando.

## FASE 10 — Beta y post-MVP (backlog priorizado)

1. Mensajería directa (WS, rooms 1:1) · 2. Stories efímeras · 3. Explorar/trending (Redis sorted sets) · 4. PWA/notificaciones push web · 5. Bloqueos/reportes/moderación · 6. App móvil (Expo consumiendo REST v1)

---

## Cronograma resumido (~10 semanas part-time)

| Semana | 1   | 2   | 3   | 4   | 5   | 6   | 7   | 8   | 9   | 10  |
| ------ | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Fase   | 0   | 1–2 | 2–3 | 3–4 | 4–5 | 5–6 | 6–7 | 7–8 | 8–9 | 9   |

**Regla anti-scope-creep:** ninguna feature nueva sin su carpeta en `specs/`. El MVP termina cuando los criterios de salida de las fases 0–9 están todos verdes.
