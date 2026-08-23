<div align="center">

  <img src="apps/web/src/app/icon.svg" width="96" alt="Logo RedSocial" />

# RedSocial

**Una red social moderna, construida en abierto con Next.js y NestJS.**

[![CI](https://github.com/RazoGit/RedSocial/actions/workflows/ci.yml/badge.svg)](https://github.com/RazoGit/RedSocial/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/node-%3E%3D22-339933?logo=nodedotjs&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-10-F69220?logo=pnpm&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-black?logo=nextdotjs&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)

</div>

---

## ¿Qué es?

Un proyecto personal para construir una red social completa —registro, perfiles,
publicaciones, feed, interacciones y multimedia— aplicando **desarrollo guiado por
especificaciones (SDD)**: primero se escribe la especificación, después el plan y las
tareas; el código solo llega cuando la prueba de aceptación está definida.

> 🚧 **Estado actual:** autenticación y sesiones funcional de punta a punta (T1–T15 de la
> spec 001): registro con verificación por email, login, OAuth (Google/GitHub),
> refresh rotatorio y recuperación de contraseña. El frontend ya consume la API real
> (mismo origen vía rewrite); quedan tests E2E y documentación (T16–T17).

## Arquitectura

```mermaid
flowchart LR
    B(["Navegador"]) --> W

    subgraph WEB ["apps/web"]
        W["Next.js<br/>Tailwind v4 + shadcn/ui"]
    end

    W -- "REST /api/v1" --> A

    subgraph API ["apps/api"]
        A["NestJS + Fastify<br/>auth · usuarios · posts"]
    end

    subgraph INFRA ["docker compose"]
        P[("PostgreSQL 17")]
        R[("Redis 7")]
        M[("MinIO · S3")]
        X["Mailpit"]
    end

    A --> P
    A --> R
    A --> M
    A -. "emails dev" .-> X
```

## Stack

| Capa           | Tecnología                                                         |
| -------------- | ------------------------------------------------------------------ |
| Frontend       | Next.js, React, Tailwind CSS v4, shadcn/ui, next-themes            |
| Backend        | NestJS 11 sobre Fastify, OpenAPI (Swagger)                         |
| Datos          | PostgreSQL 17 + Prisma ORM (`citext`, migraciones SQL)             |
| Seguridad      | jose (JWT HS256), refresh tokens opacos rotatorios, argon2id       |
| Jobs / colas   | Redis + BullMQ                                                     |
| Almacenamiento | MinIO (API S3)                                                     |
| Monorepo       | pnpm workspaces + Turborepo                                        |
| Calidad        | ESLint, Prettier, Commitlint, Husky, Vitest (+SWC), GitHub Actions |

## Estructura

```text
RedSocial/
├── apps/
│   ├── web/          # Frontend Next.js
│   └── api/          # API NestJS + Prisma
├── packages/
│   ├── config/       # Configuraciones compartidas
│   └── contracts/    # Tipos y schemas compartidos cliente↔servidor
├── specs/            # Especificaciones SDD (spec · plan · tasks)
├── docs/             # Roadmap y decisiones técnicas
└── docker-compose.yml
```

## Inicio rápido

**Requisitos:** Node ≥ 22, pnpm 10, Docker Desktop.

```bash
# 1. Clonar e instalar dependencias
git clone https://github.com/RazoGit/RedSocial.git
cd RedSocial
pnpm install

# 2. Levantar la infraestructura local
docker compose up -d

# 3. Variables de entorno de la API
#    apps/api/.env
DATABASE_URL=postgresql://redsocial:redsocial@localhost:5432/redsocial?schema=public
PORT=4000
JWT_SECRET=<genera uno aleatorio, minimo 32 caracteres>

# 4. Aplicar migraciones de base de datos
pnpm --filter @redsocial/api prisma:migrate

# 5. Arrancar web + api en modo desarrollo
pnpm dev
```

| Servicio             | URL                                       |
| -------------------- | ----------------------------------------- |
| Web                  | <http://localhost:3000>                   |
| API health           | <http://localhost:4000/api/v1/health>     |
| OpenAPI              | <http://localhost:4000/docs/openapi.json> |
| Mailpit (emails dev) | <http://localhost:8025>                   |
| MinIO console        | <http://localhost:9001>                   |

## Scripts

| Comando                                      | Descripción                               |
| -------------------------------------------- | ----------------------------------------- |
| `pnpm dev`                                   | Web + API en modo watch (Turborepo)       |
| `pnpm build`                                 | Build de todos los paquetes               |
| `pnpm lint`                                  | ESLint en todo el monorepo                |
| `pnpm typecheck`                             | TypeScript estricto                       |
| `pnpm --filter @redsocial/api test`          | Tests unitarios y de integración (Vitest) |
| `pnpm --filter @redsocial/api prisma:studio` | Explorador de datos Prisma                |

## Metodología: SDD

Cada funcionalidad vive en `specs/<numero>-<nombre>/` con tres documentos:

1. **spec.md** — requisitos, criterios de aceptación y contratos de API.
2. **plan.md** — decisiones técnicas y modelo de datos.
3. **tasks.md** — checklist verificable tarea a tarea; no se avanza si la anterior
   no compila, pasa lint y sus tests.

La especificación activa es [`specs/001-autenticacion`](specs/001-autenticacion/tasks.md).

## Roadmap

- [x] Fase 0 — Bootstrap del monorepo, tooling y CI
- [x] Fase 1 — Fundación API + identidad visual
- [x] Fase 2 — Infraestructura de datos y primitivas de seguridad
- [ ] Autenticación completa: registro local, OAuth manual, verificación de email · **T15/17**
- [ ] Perfiles, publicaciones y reacciones
- [ ] Feed, multimedia (MinIO) y notificaciones
- [ ] Despliegue en free tier

---

<div align="center">
  <sub>Construido con ☕ y especificaciones. — <a href="https://github.com/RazoGit">@RazoGit</a></sub>
</div>
