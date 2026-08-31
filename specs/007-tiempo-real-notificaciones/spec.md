# Spec 007 — Tiempo Real y Notificaciones

- Estado: Borrador para planificacion
- Fecha: 2026-08-30
- Prioridad: P1
- Implementacion: Fase 7 del ROADMAP · Dependencias: spec 001 (auth JWT), spec 004 (posts), spec 005 (follows), spec 006 (likes/comentarios)

## 1. Objetivo

Llevar la plataforma a tiempo real: el usuario recibe notificaciones al instante (like, comentario, respuesta, follow) via canal WebSocket autenticado, con campana de badge no leido en el frontend y presence basica (online/offline). Criterio de salida del ROADMAP: accion en dispositivo A notifica en B en < 1 s.

## 2. Alcance

**Incluye:** Gateway Socket.IO autenticado con access token JWT, rooms por usuario con adaptador Redis (multi-instancia), persistencia de notificaciones en PostgreSQL, emision WS a la recepcion del evento, badge de no leidas, lista paginada de notificaciones, marcado individual/total como leidio, presence basica (online/offline con TTL Redis), frontend: campana + badge + toasts + lista.

**No incluye:** Mensajeria directa, notificaciones push web (PWA), emails de notificacion, preferencias por tipo de notificacion, mute por usuario, stories/presence avanzada (writing indicators, rooms 1:1).

## 3. Historias de usuario

| ID  | Historia                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------- |
| US1 | Como usuario, quiero recibir al instante un aviso cuando alguien da like a mi post.                     |
| US2 | Como usuario, quiero recibir al instante un aviso cuando comentan o responden a un post/comentario mio. |
| US3 | Como usuario, quiero recibir al instante un aviso cuando alguien me sigue.                              |
| US4 | Como usuario, quiero ver en la campana cuantas notificaciones no leidas tengo.                          |
| US5 | Como usuario, quiero ver una lista paginada de mis notificaciones y marcarlas como leidas.              |
| US6 | Como usuario, quiero ver si un perfil esta online/offline.                                              |

## 4. Requisitos funcionales (EARS)

- **RF-1** CUANDO un usuario autenticado se conecta al Gateway v1 con un access token JWT valido, EL SISTEMA lo une a su room personal `user:{id}`. Si el token falta o es invalido, EL SISTEMA rechaza la conexion (handshake error).
- **RF-2** CUANDO se produce un like a un post, EL SISTEMA creara una notificacion persistida para el autor del post (si el autor no es el propio actor) y la emitira por WS a `user:{authorId}` inmediatamente.
- **RF-3** CUANDO se crea un comentario en un post ajeno, EL SISTEMA creara y emitira una notificacion al autor del post. Si el comentario es una respuesta con `parentId`, EL SISTEMA tambien notificara al autor del comentario padre (si es distinto del autor del post y del actor).
- **RF-4** CUANDO se produce un follow, EL SISTEMA creara y emitira una notificacion al usuario seguido (si no es privado o incluso si lo es, notificarasolo cuando el follow se confirma; para cuentas privadas la notificacion se emite al aceptar la solicitud — fuera de alcance, ver RF-9).
- **RF-5** CUANDO un usuario consulte `GET /api/v1/notifications`, EL SISTEMA devolvera su lista paginada cursor-based (`createdBefore`, `limit` default 20) con actor y post relacionados.
- **RF-6** CUANDO un usuario marque una notificacion (`PATCH /api/v1/notifications/:id/read`) o todas (`POST /api/v1/notifications/read-all`), EL SISTEMA persistira `readAt` y emitira el nuevo conteo de no leidas por WS.
- **RF-7** CUANDO un usuario se conecte al Gateway, EL SISTEMA emitira al cliente el `unreadCount` inicial. CUANDO llega una notificacion nueva, EL SISTEMA emitira `notification:new` (con el conteo actualizado) a la room del receptor.
- **RF-8** CUANDO un usuario se conecta, EL SISTEMA registrara `presence:{userId}` en Redis con TTL 120 s y lo refrescara con la actividad/heatbeat. CUANDO se desconecta o expira el TTL, EL SISTEMA marcara offline y emitira el cambio a los seguidores conectados.
- **RF-9** CUANDO el perfil consultado sea privado y el consultante no siga al usuario, EL SISTEMA NO expondra su presencia (respuesta sin campo `isOnline`). En caso contrario, `GET /users/:username` incluira `isOnline` con TTL Redis como fallback de offline.
- **RF-10** CUANDO se emita una notificacion a un usuario sin conexion activa, EL SISTEMA conservara la persistencia; el unreadCount se calcula de PostgreSQL, no de Redis.
- **RF-11** CUANDO el servicio de notificaciones falle al emitir por WS, EL SISTEMA no bloqueara la operacion principal (like/comentario/follow): la notificacion se persistira igualmente y el badge se sincronizara en el siguiente fetch o conexion.

## 5. Endpoints previstos (contrato v1)

| Metodo | Ruta                                 | Auth   | Descripcion                                |
| ------ | ------------------------------------ | ------ | ------------------------------------------ |
| WS     | `/socket.io`                         | token  | Handshake JWT + rooms + eventos de dominio |
| GET    | `/api/v1/notifications`              | access | Lista paginada cursor-based                |
| PATCH  | `/api/v1/notifications/:id/read`     | access | Marcar una como leida                      |
| POST   | `/api/v1/notifications/read-all`     | access | Marcar todas como leidas                   |
| GET    | `/api/v1/notifications/unread-count` | access | Conteo actual (fallback sin WS)            |

Eventos WS (dominio):

| Evento (server→client)  | Payload                                        |
| ----------------------- | ---------------------------------------------- |
| `notifications:initial` | `{ unreadCount, lastId }`                      |
| `notification:new`      | `{ notification, unreadCount }`                |
| `notifications:unread`  | `{ unreadCount }` (tras marcar leida)          |
| `presence:change`       | `{ userId, online }` (a seguidores conectados) |

Client→server:

| Evento              | Payload  | Descripcion                 |
| ------------------- | -------- | --------------------------- |
| `heartbeat`         | —        | Refresca TTL de presencia   |
| `notification:read` | `{ id }` | Confirma lectura individual |

## 6. Criterios de aceptacion (Gherkin)

```gherkin
Escenario: Conexion autenticada al Gateway
  Dado un access token JWT valido del usuario A
  Cuando A se conecta a /socket.io con el token
  Entonces queda unido a la room user:A
  Y recibe notifications:initial con unreadCount

Escenario: Rechazo sin token
  Dado un cliente sin access token valido
  Cuando intenta conectarse a /socket.io
  Entonces la conexion es rechazada en el handshake

Escenario: Notificacion de like en tiempo real
  Dado el usuario A conectado al Gateway y un post P de A
  Cuando B da like a P
  Entonces A recibe notification:new con type=like en < 1 s
  Y la notificacion queda persistida con readAt=null

Escenario: Notificacion de comentario y respuesta
  Dado un post P de A y un comentario C de B en P
  Cuando C comenta en P
  Entonces A recibe notification:new type=comment
  Y B (autor de C) recibe notification:new type=reply (si C != autor del post)

Escenario: Notificacion de follow
  Dado un usuario B que sigue a A (cuenta publica)
  Entonces A recibe notification:new type=follow

Escenario: Lista de notificaciones paginada
  Dado el usuario A con 25 notificaciones
  Cuando A consulta GET /notifications?limit=20
  Entonces recibe 20 items con nextCursor
  Y la siguiente pagina devuelve las 5 restantes

Escenario: Marcar como leida
  Dado el usuario A con notificaciones no leidas
  Cuando A marca una (PATCH /notifications/:id/read) o todas (POST /notifications/read-all)
  Entonces readAt queda seteado
  Y A recibe notifications:unread con el conteo decrementado

Escenario: Presence online/offline
  Dado el usuario A conectado al Gateway
  Cuando B consulta GET /users/A
  Entonces isOnline=true (cuenta publica o B sigue a A)
  Cuando A se desconecta o su TTL expira
  Entonces isOnline=false y los seguidores conectados reciben presence:change

Escenario: Presence oculta en cuenta privada sin follow
  Dado el usuario A privado y el usuario B que no lo sigue
  Cuando B consulta GET /users/A
  Entonces la respuesta no incluye isOnline
```

## 7. No funcionales

- Evento like→notificacion end-to-end < 1 s (ROADMAP Fase 7): persistencia, emision WS y actualizacion de badge dentro del SLA.
- Adaptador Redis para el Gateway: instancias multiples comparten rooms y broadcast.
- Contadores de no leidas siempre consistentes (fuente de verdad: PostgreSQL); Redis solo como cache de presence.
- Redis del presence con TTL 120 s y expiracion que no se propaga en cascada al desconectar.
- Cobertura >= 75% en modulos notifications + presence + gateway.
- P95 de GET /notifications < 150 ms con paginacion cursor-based (indice `[userId, createdAt]`).
