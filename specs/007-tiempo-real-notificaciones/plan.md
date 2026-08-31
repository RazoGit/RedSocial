# Plan 007 — Tiempo Real y Notificaciones

## 1. Modelo de datos (Prisma)

```prisma
enum NotificationType {
  like
  comment
  reply
  follow
}

/// Notificacion persistida para el receptor (spec 007). Fuente de verdad
/// del unreadCount. Se crea en la misma transaccion de la accion (like,
/// comment, follow) y se emite por WS tras commit.
model Notification {
  id        String           @id @default(uuid()) @db.Uuid
  userId    String           @map("user_id") @db.Uuid       // receptor
  actorId   String           @map("actor_id") @db.Uuid      // quien acciona
  type      NotificationType
  postId    String?          @map("post_id") @db.Uuid       // like/comment/reply
  commentId String?          @map("comment_id") @db.Uuid    // reply/comment
  readAt    DateTime?        @map("read_at") @db.Timestamptz(3)
  createdAt DateTime         @default(now()) @map("created_at") @db.Timestamptz(3)

  user   User  @relation(fields: [userId], references: [id], onDelete: Cascade)
  actor  User  @relation("NotificationActor", fields: [actorId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt(sort: Desc)])
  @@index([userId, readAt])
  @@map("notifications")
}
```

Relaciones anadidas a `User`:

```prisma
model User {
  // ...campos existentes...
  notificationsReceived Notification[] @relation("NotificationReceiver")
  notificationsActed    Notification[] @relation("NotificationActor")
}
```

Nota: `postId`/`commentId` sin FK (referencias cruzadas) para no acoplar el cascade de borrado de posts/comentarios: al borrar un post o comentario se conserva la notificacion historica.

**Migracion:** `pnpm --filter @redsocial/api prisma:migrate --name add_notifications`

## 2. Dependencias nuevas (apps/api)

```bash
pnpm --filter @redsocial/api add @nestjs/websockets @nestjs/platform-socket.io socket.io @socket.io/redis-adapter
pnpm --filter @redsocial/api add -D @types/socket.io
```

- `@nestjs/websockets` + `@nestjs/platform-socket.io`: Gateways de NestJS sobre Socket.IO.
- `@socket.io/redis-adapter`: broadcast multi-instancia (Redis pub/sub).

## 3. Contratos Zod (packages/contracts)

```typescript
export const NotificationTypeSchema = z.enum(["like", "comment", "reply", "follow"]);

export const NotificationActorSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
});

export const NotificationSchema = z.object({
  id: z.string().uuid(),
  type: NotificationTypeSchema,
  actor: NotificationActorSchema,
  postId: z.string().uuid().nullable(),
  commentId: z.string().uuid().nullable(),
  read: z.boolean(),
  createdAt: z.string(), // ISO
});
export type Notification = z.infer<typeof NotificationSchema>;

export const NotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  createdBefore: z.string().datetime().optional(),
});
export type NotificationsQuery = z.infer<typeof NotificationsQuerySchema>;

export const NotificationsResponseSchema = z.object({
  items: z.array(NotificationSchema),
  nextCursor: z.string().nullable(),
  unreadCount: z.number().int().min(0),
});
export type NotificationsResponse = z.infer<typeof NotificationsResponseSchema>;

export const UnreadCountResponseSchema = z.object({
  unreadCount: z.number().int().min(0),
});
export type UnreadCountResponse = z.infer<typeof UnreadCountResponseSchema>;

export const MarkNotificationsReadRequestSchema = z
  .object({ ids: z.array(z.string().uuid()).max(100).optional() })
  .strict();
```

## 4. Eventos WS (detalle)

Handshake: `socket.handshake.auth.token` = access token JWT (el cliente Socket.IO lo envia en el `auth`). Se valida con `TokensService.verifyAccessToken`; fallo => `next(new Error("unauthorized"))` sin aceptar la conexion.

| Evento client→server | Payload         | Accion                                              |
| -------------------- | --------------- | --------------------------------------------------- |
| `presence:watch`     | `{ userIds[] }` | Join del cliente a `presence:{id}` (max 100/evento) |
| `presence:unwatch`   | `{ userIds[] }` | Leave de `presence:{id}`                            |
| `heartbeat`          | —               | Refresca `presence:{userId}` TTL 120 s              |

| Evento server→client    | Payload                         | Emitido a                     |
| ----------------------- | ------------------------------- | ----------------------------- |
| `notifications:initial` | `{ unreadCount }`               | socket propio en connect      |
| `notification:new`      | `{ notification, unreadCount }` | room `user:{id}` del receptor |
| `notifications:unread`  | `{ unreadCount }`               | room `user:{id}` del usuario  |
| `presence:change`       | `{ userId, online }`            | room `presence:{userId}`      |

Rooms: cada socket conectado entra a `user:{userId}` (una sola). Los `presence:*` rooms se gestionan con `presence:watch`.

## 5. Presence (Redis)

- Conectar: `SET presence:{userId} "1" EX 120`.
- `heartbeat` / actividad: `EXPIRE presence:{userId} 120`.
- Desconectar: `DEL presence:{userId}` + emitir `presence:change { online:false }` a la room de presencia del usuario.
- Lectura (`getIsOnline`): `EXISTS`; si Redis no disponible => `false` (fallback), nunca bloquea.
- Privacidad (RF-9): `GET /users/:username` incluye `isOnline` solo si perfil publico o el viewer sigue al usuario. Se calcula con los datos ya disponibles en ProfileService (isPrivate + isFollowing).
- TTL actua como safetynet ante crashes (desconexion sin `disconnect` limpio).

## 6. Modulos NestJS

```
apps/api/src/modules/
  realtime/
    realtime.module.ts        # exports RealtimeGateway + RedisIoAdapter
    redis-io.adapter.ts       # adapter socket.io + @socket.io/redis-adapter
    realtime.gateway.ts       # handshake JWT, rooms, presence:watch, heartbeat
    realtime.gateway.spec.ts
  notifications/
    notifications.module.ts
    notifications.controller.ts   # GET /notifications, PATCH/:id/read, POST/read-all
    notifications.service.ts      # list, markRead, markAllRead, unreadCount, create+emit
    notifications.service.spec.ts
    notifications.int.spec.ts
  presence/
    presence.module.ts        # exports PresenceService
    presence.service.ts       # setOnline/ttl/offline/isOnline (Redis opcional)
    presence.service.spec.ts
```

**NotificacionesService:**

```typescript
async create(receiverId, payload: { actorId, type, postId?, commentId? }): Promise<void> {
  const current = await tx.notification.count({ where: { userId, readAt: null } });
  const notification = await tx.notification.create({ ... relation actor });
  // emit no-blocking (RF-11): prueba, si falla solo log
  this.realtime.emitNotification(receiverId, notification, current + 1);
}
```

La emision ocurre despues del commit de la accion principal. `RealtimeGateway.emit...` envuelve `this.server.to(room).emit(...)` en try/catch y no relanza.

**Integraciones de emision:**

- `LikesService.like(...)`: tras crear like, si `post.authorId !== actorId` => `notificationsService.create(post.authorId, { actorId, type: "like", postId })`. Se inyecta NotificationsService en LikesModule (forwardRef para evitar ciclos si notificaciones importa posts).
- `CommentsService.create(...)`: notificar autor del post (`type: "comment"`) si no es quien comenta; si hay `parentId`, notificar autor del padre (`type: "reply"`) si es distinto del autor del post y del actor.
- `FollowsService.follow(...)`: cuenta publica => notificar `type: "follow"` al seguido (cuentas privadas quedan fuera de alcance mientras no exista el flujo de solicitudes).

**Controllers REST:**

- `GET /api/v1/notifications?limit&createdBefore` → `{ items, nextCursor, unreadCount }`. Solo del usuario autenticado. Items con `actor` y flags `read`/`postId`/`commentId`.
- `PATCH /api/v1/notifications/:id/read` → 200 `{ id, read: true }`; solo de propietario (404 si no es suya). Emite `notifications:unread`.
- `POST /api/v1/notifications/read-all` → 200 `{ ok: true }`; todo `userId` con readAt null => ahora. Emite `notifications:unread { unreadCount: 0 }`.
- `GET /api/v1/notifications/unread-count` → `{ unreadCount }` (fallback sin WS).

## 7. main.ts (bootstrap)

```typescript
const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
await app.register(fastifyCookie);
const redisAdapter = new RedisIoAdapter(app);
app.useWebSocketAdapter(redisAdapter);
// ...prefijos, versioning, swagger (en la ruta nueva NO entra el gateway)
```

RedisIoAdapter extiende `IoAdapter` y aplica `@socket.io/redis-adapter` con `createAdapter(pubClient, subClient)` solo si hay REDIS_URL. Sin Redis, el adapter es el default (funciona en tests/dev sin docker).

## 8. Frontend (apps/web)

- **Cliente Socket.IO prop:** `lib/socket.ts` — conecta a `<API_URL>/socket.io` con `auth: { token }`. Reconexion con backoff, `disconnected` => silencio (el badge se refresca por REST).
- **Provider `NotificationsProvider`** (React): estado `unreadCount`, `notifications`. Ciclo: al login → `connect()`; eventos `notifications:initial`, `notification:new`, `notifications:unread`; metodos `markAllRead()`, `markRead(id)`.
- **Campana**: `NabBar` gana icono de campana con badge `unreadCount` (muted cuando 0); dropdown con las ultimas notificaciones, boton "Marcar todo como leido".
- **Pagina `/notifications`**: lista paginada (infinite scroll con cursor, reuse `useInfiniteScroll`), row: avatar actor + texto por tipo ("te dio like", "comento en tu post", "te respondio", "te siguio") + timeout relativo + link al post.
- **Toasts**: toast efimero (`sonner`) cuando llega `notification:new` y el usuario NO esta en `/notifications`.
- **Presence**: en perfil `/u/[username]` y `PostCard` de feed -> `presence:watch` de los autores visibles; dot verde/gris. Se emite `presence:unwatch` al desmontar.
- **Generar cliente:** `pnpm --filter @redsocial/web generate:api` tras exportar OpenAPI (los endpoints de notificaciones entran al contrato; los eventos WS se tipan a mano en `packages/contracts`).

## 9. Seguridad

- Handshake Socket.IO exige access token valido; sin token/invalido => handshake rechazado (no entra a rooms).
- El cliente nunca elige su room: `user:{userId}` derivado del token verificado (nunca de payload del cliente).
- `presence:watch` autorizado: solo rooms de presencia de usuarios (room name fijo por id), no expone datos.
- Notificaciones solo del owner: `findMany` y `markRead` filtrados por `userId` autenticado.
- `read-all` solo marca las del usuario autenticado.
- Redaccion del texto de notificacion en frontend (tipos), nunca contenido crudo del actor.
- RF-11: fallo de WS nunca rompe la accion REST; log y continuar.

## 10. Migracion e indices

```bash
pnpm --filter @redsocial/api prisma:migrate --name add_notifications
```

- Tabla `notifications` + enum `NotificationType`.
- Indice `(userId, created_at DESC)` para la lista cursor-based.
- Indice `(userId, read_at)` para conteo de no leidas.
- Sin FK a posts/comments (historial inmbortable).

## 11. Tests previstos

- Unit: `NotificationService` (create+emit no-blocking, list cursor, markRead owner, markAllRead, unreadCount).
- Unit: `PresenceService` (set/exists/offline, fallback sin Redis).
- Unit: `RealtimeGateway` (handshake token valido/invalido, join room user:{id}, presence:watch/unwatch, heartbeat refresh).
- Int: REST notifications (list, paginacion, markRead ajeno 404, read-all, unread-count) con FakePrisma.
- Int: emision en transaccion — like/comment/follow generan Notification persistida (FakePrisma + gateway stub).
- Smoke E2E en vivo (Docker): dos conexiones WS, like en B => notification:new en A < 1 s; badge; presence.

Criterio de salida: smoke `SMOKE-OK-007` similar a los anteriores + cobertura >=75% en modulos nuevos.
