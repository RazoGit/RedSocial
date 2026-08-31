# Tasks 007 — Tiempo Real y Notificaciones

> Regla: cada tarea es verificable de forma independiente y sigue test-first donde aplica.
> No se avanza a la siguiente si la anterior no compila, pasa sus tests y lint.

## Bloque A — Base y modelo

- [x] **T1.** Deps: `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io`, `@socket.io/redis-adapter` (dev `@types/socket.io`). _Verificar: `pnpm install` sin errores._
- [x] **T2.** Prisma: modelo `Notification` + enum `NotificationType` (plan §1), indices `[userId, createdAt Desc]` y `[userId, readAt]`. Migracion aplicada. _Verificar: `prisma migrate dev` sin error._
- [x] **T3.** Contratos Zod en `@redsocial/contracts`: NotificationSchema, NotificationsQuerySchema, NotificationsResponseSchema, UnreadCountResponseSchema, MarkNotificationsReadRequestSchema. _Verificar: `pnpm build` en packages/contracts sin errores._

## Bloque B — Presence

- [x] **T4.** `PresenceService`: `setOnline`, `touch` (TTL 120 s), `setOffline`, `isOnline` (EXISTS), fallback seguro sin Redis. Tests unitarios con Redis mock/nulo. _Verificar: testes pasan, Redis caido devuelve false sin throw._
- [x] **T5.** `GET /users/:username` actualizado: incluye `isOnline` solo si perfil publico o viewer sigue al usuario (RF-9). Tests: publico online, privado visto por follower online, privado ajeno sin campo.

## Bloque C — Gateway Socket.IO

- [x] **T6.** `RealtimeGateway`: handshake autenticado con access token (auth.token), fallo => `unauthorized`, join a `user:{id}`, emite `notifications:initial` con unreadCount. Tests con socket client mock: token valido/invalido, room correcta.
- [x] **T7.** `RedisIoAdapter`: aplica `@socket.io/redis-adapter` si hay REDIS_URL, default sinon. _Verificar: bootstrap con/sin REDIS_URL sin errores; dos procesos comparten broadcast (smoke en vivo)._
- [x] **T8.** Eventos `presence:watch` / `presence:unwatch` (max 100 ids) y `heartbeat` (refresca TTL). `disconnect` => `setOffline` + `presence:change`. Tests: join/leave rooms, desconexion emite cambio.

## Bloque D — Notificaciones API

- [x] **T9.** `NotificacionesService`: `create` (persiste + cuenta unread + emite no-blocking), `list` (cursor `createdBefore`), `markRead` (solo owner, 404), `markAllRead`, `unreadCount`. Tests unitarios con FakePrisma y gateway stub (fallo de emision no rompe).
- [x] **T10.** `GET /api/v1/notifications`: items con actor/read/postId/commentId + `nextCursor` + `unreadCount`. Tests: lista vacia, paginacion, cursor, sin token (401).
- [x] **T11.** `PATCH /api/v1/notifications/:id/read` (solo owner, 404 ajeno) y `POST /api/v1/notifications/read-all`. Ambos emiten `notifications:unread`. Tests: owner ok, ajeno 404, read-all actualiza todo, sin token 401.
- [x] **T12.** `GET /api/v1/notifications/unread-count`. Tests: 0 y N no leidas.

## Bloque E — Integracion de eventos

- [x] **T13.** Like emite notificacion al autor del post (si no es el propio actor). Tests: like ajeno crea Notification type=like, like propio no.
- [x] **T14.** Comment emite al autor del post (`comment`) y al autor del padre si existe (`reply`), evitando duplicados (autor post == actor, autor padre == actor, autor padre == autor post). Tests: casos cubiertos.
- [x] **T15.** Follow emite `follow` al seguido (cuenta publica). Tests: follow crea notificacion, self-follow no.
- [x] **T16.** Emision por WS en transaccion: tras like/comentario/follow, el receptor conectado recibe `notification:new` con unreadCount incrementado. Tests de integracion con gateway stub.

## Bloque F — Frontend

- [ ] **T17.** Regenerar OpenAPI + cliente Orval (endpoints notifications). Tipos WS manuales en `@redsocial/contracts`. _Verificar: `pnpm generate:api` exitoso._
- [ ] **T18.** `lib/socket.ts` + `NotificationsProvider`: conecta con token, estados unreadCount/notifications, eventos initial/new/unread, markRead/markAllRead. _Verificar: badge en NavBar refleja unreadCount._
- [ ] **T19.** Campana en NavBar: badge, dropdown con ultimas notificaciones, boton marcar todo leido. _Verificar: click muestra lista y actualiza badge._
- [ ] **T20.** Pagina `/notifications`: lista paginada con `useInfiniteScroll`, texto por tipo, link al post, timeout relativo.
- [ ] **T21.** Toast `notification:new` cuando no se esta en `/notifications`. _Verificar: toast aparece al like ajeno en otra pestana._
- [ ] **T22.** Presence en perfil y `PostCard` de feed: `presence:watch` de autores visibles, dot online/offline, `presence:unwatch` al desmontar. _Verificar: perfil muestra online cuando el autor conecta._

## Bloque G — Cierre

- [ ] **T23.** Smoke E2E en vivo (Docker): A y B conectados a WS; B like/comenta/sigue => A recibe `notification:new` en < 1 s; badge sube; marcar leido decrementa; A desconecta => `isOnline=false` y `presence:change` a B. _Verificar: flujo completo `SMOKE-OK-007`._
- [ ] **T24.** README actualizado + cobertura >=75% (notifications + presence + gateway). _Verificar: tests pasan, CI verde._

## Definition of Done de la spec

- [ ] Todas las tareas marcadas y sus criterios demostrados
- [ ] Criterios Gherkin de spec.md automatizados (unit/integración según plan §11)
- [ ] Cobertura >=75% · CI verde · contrato OpenAPI sin breaking changes vs v0
- [ ] Evento like→notificacion probado con Docker en < 1 s (criterio Fase 7 ROADMAP)
