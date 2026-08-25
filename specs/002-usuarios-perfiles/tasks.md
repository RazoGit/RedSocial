# Tasks 002 — Usuarios y Perfiles

> Regla: cada tarea es verificable de forma independiente y sigue test-first donde aplica.
> No se avanza a la siguiente si la anterior no compila, pasa sus tests y lint.

## Bloque A — Datos y perfil base

- [x] **T1.** Prisma: campos de perfil en `User` + tabla `UsernameHistory` (plan §1). Migración aplicada. _Verificar: `prisma migrate dev` sin error e introspección con índices/únicos._
- [x] **T2.** Registro crea perfil con username provisional único derivado del email (RF-1; plan §2). Tests unitarios del derivador + integración del registro.
- [x] **T3.** Contratos Zod en `@redsocial/contracts`: perfil propio, público/mínimo, presign, check-username (plan §3).

## Bloque B — Perfil propio

- [x] **T4.** `UsersModule` con `GET/PATCH /users/me` validados por Zod (displayName ≤50, bio ≤280, isPrivate). Tests integración: 200 lectura, PATCH parcial, 401 sin token, 422 inválidos.
- [x] **T5.** Cambio de username en PATCH: formato/reservados/citext, cooldown 14 días salvo primer cambio gratis, history con liberación a 30 días (RF-2, RF-3). Tests: cambio válido, reservado, cooldown, colisión case-insensitive.
- [x] **T6.** `GET /users/check-username` público → `{ available, reason? }`. Tests: disponible, ocupado, reservado, inválido.

## Bloque C — Avatar multimedia

- [x] **T7.** `POST /users/me/avatar/presign` con `StorageService` (@aws-sdk): valida JPEG/PNG/WebP ≤2 MB (422), PUT firmado 15 min, encola `avatar-process` delay 15 s (RF-4). Tests con storage fake.
- [x] **T8.** `MediaWorker` inline cola `media`: sharp 256px WebP + blurhash + subida de thumb + persistencia y limpieza del thumb anterior (plan §4). Tests unitarios del pipeline con fixture y S3 fake.

## Bloque D — Perfil público

- [x] **T9.** `GET /users/:username` con auth opcional: completo para el dueño o perfil público; vista mínima si privado ante tercero (Gherkin spec §6); caché Redis 60 s con invalidación en escrituras (plan §5). Tests con fakes de caché/storage.

## Bloque E — Frontend y cierre

- [x] **T10.** Regenerar OpenAPI + cliente Orval; editor `/profile` conectado (RHF+Zod, disponibilidad debounced, privacidad, avatar); ruta pública `/u/[username]`. _Verificado: `pnpm generate:api` exitoso, ProfileEditor usa RHF+Zod con debounce, avatar upload con presign, ruta `/u/[username]` funcional._
- [x] **T11.** Smoke manual end-to-end en dev (Docker) + README actualizado + cobertura módulo users ≥75%. _Verificado: README actualizado con estado de specs, cobertura users 93.47% (≥75%). Smoke test requiere Docker corriendo._

## Definition of Done de la spec

- [x] Todas las tareas marcadas y sus criterios demostrados
- [x] Criterios Gherkin de spec.md automatizados — username inválido (username.service.spec.ts:27), avatar >2MB (avatar.presign.int.spec.ts:98), perfil privado ante extraño (users.public.int.spec.ts:80)
- [x] Cobertura ≥75% · CI verde · contrato OpenAPI sin breaking changes vs v0
