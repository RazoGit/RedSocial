# Tasks 005 — Grafo Social y Feed Principal

> Regla: cada tarea es verificable de forma independiente y sigue test-first donde aplica.
> No se avanza a la siguiente si la anterior no compila, pasa sus tests y lint.

## Bloque A — Modelo de datos

- [ ] **T1.** Prisma: modelo `Follow` (plan §1) con unique compuesto `[followerId, followingId]` e índice en `followingId`. _Verificar: `prisma migrate dev` sin error._
- [ ] **T2.** Prisma: añadir campos `followersCount` y `followingCount` a `User` (default 0). Migración aplicada. _Verificar: `prisma db pull` muestra los campos._
- [ ] **T3.** Seed o migración SQL: inicializar contadores existentes a 0 (ya están por default). _Verificar: `prisma studio` muestra users con followersCount=0, followingCount=0._

## Bloque B — Contratos

- [ ] **T4.** Contratos Zod en `@redsocial/contracts`: FollowResponseSchema, FeedQuerySchema, FeedResponseSchema. Actualizar UserProfileResponseSchema con `followersCount`, `followingCount`, `isFollowing`. _Verificar: `pnpm build` en packages/contracts sin errores._

## Bloque C — Follow/Unfollow API

- [ ] **T5.** `POST /users/:username/follow`: inserta Follow relationship + incrementa contadores atómicamente. Tests: follow válido (200), seguirse a sí mismo (400), follow duplicado (409), usuario inexistente (404), sin token (401).
- [ ] **T6.** `DELETE /users/:username/follow`: elimina Follow + decrementa contadores. Tests: unfollow válido (200), unfollow no seguido (404), sin token (401).
- [ ] **T7.** Servicio `FollowsService`: lógica de follow/unfollow con transacciones SQL para contadores atómicos. _Verificar: tests unitarios cubrenhappy path, duplicado, no existe, self-follow._

## Bloque D — Feed API

- [ ] **T8.** `GET /feed`: feed cronológico de posts de usuarios seguidos. Cursor-based con `?limit=20&createdBefore=<ISO>`. Tests: feed vacío, feed con posts, paginación, posts eliminados no aparecen, sin token (401).
- [ ] **T9.** Integración Redis para feed: lectura de lista `feed:{userId}`, fallback a query Postgres. Tests unitarios con Redis mock (ioredis-mock o stub).
- [ ] **T10.** Invalidación de feed: al eliminar un post, remover de Redis lists afectadas. Tests: post eliminado no aparece en feed.

## Bloque E — Fan-out worker

- [ ] **T11.** Cola BullMQ `fan-out-post`: al crear un post, encola job con `{ postId, authorId }`. Worker lee followers del author y hace `LPUSH` a cada `feed:{followerId}`. Tests: fan-out a N followers, cap 10 000 (pull mode), Redis mock.
- [ ] **T12.** Límites Redis: `LTRIM` a 1000 items, TTL 7 días. Tests: lista no crece indefinidamente, expiración verificada.

## Bloque F — Perfil actualizado

- [ ] **T13.** `GET /users/:username`: añadir `followersCount`, `followingCount`, `isFollowing` (si autenticado). Tests: perfil público con contadores, isFollowing=true/false, perfil privado sin follow → minimal response.
- [ ] **T14.** Cache de `isFollowing` en Redis (set `following:{userId}` con IDs de seguidos, TTL 5 min). _Verificar: tests unitarios con mock de Redis._

## Bloque G — Frontend

- [ ] **T15.** Regenerar OpenAPI + cliente Orval. _Verificar: `pnpm generate:api` exitoso._
- [ ] **T16.** Feed principal `/feed`: reemplazar mock data con fetch real a `GET /feed`. Tab "Siguiendo" muestra posts reales con infinite scroll. Tab "Para ti" mantiene mock data.
- [ ] **T17.** Botón seguir en `/u/[username]`: estado optimista (click → actualiza UI → envía request → revierte si falla). Muestra `followersCount` y `followingCount`.
- [ ] **T18.** `PostCard` adaptado para aceptar `PostResponse` del API (no solo `MockPost`). Soporte para imagen real (thumbKey/blurhash).

## Bloque H — Cierre

- [ ] **T19.** Smoke manual end-to-end en dev: seguir a un usuario, crear post, verificar en feed del seguidor, dejar de seguir, verificar que desaparece. _Verificar: flujo completo sin errores._
- [ ] **T20.** README actualizado + cobertura módulo follows/feed ≥75%. _Verificar: tests pasan, módulo con unit + integration tests._

## Definition of Done de la spec

- [ ] Todas las tareas marcadas y sus criterios demostrados
- [ ] Criterios Gherkin de spec.md automatizados (unit/integración según plan §6)
- [ ] Cobertura ≥75% · CI verde · contrato OpenAPI sin breaking changes vs v0
- [ ] Fan-out probado con Docker (Redis + PostgreSQL)
