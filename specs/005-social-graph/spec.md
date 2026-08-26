# Spec 005 — Grafo Social y Feed Principal

- Estado: Borrador para planificación
- Fecha: 2026-08-25
- Prioridad: P0
- Implementación: Fase 5 del ROADMAP · Dependencias: spec 001, spec 002, spec 004

## 1. Objetivo

Permitir a los usuarios seguir/dejar de seguir a otros y consumir un feed cronológico de los usuarios que siguen, transformando la app de una herramienta tipo blog en una red social real.

## 2. Alcance

**Incluye:** Follow/unfollow con contadores atómicos, feed home cronológico paginado con caché Redis, fan-out de posts en background vía BullMQ, botón de seguir optimista en frontend.

**No incluye:** Likes/comentarios (spec 006), notificaciones en tiempo real (spec 007), stories, trending, bloqueos/reportes.

## 3. Historias de usuario

| ID  | Historia                                                                                        |
| --- | ----------------------------------------------------------------------------------------------- |
| US1 | Como usuario, quiero seguir a otro usuario para ver sus posts en mi feed principal.             |
| US2 | Como usuario, quiero dejar de seguir a alguien para que sus posts no aparezcan en mi feed.      |
| US3 | Como usuario, quiero ver un feed cronológico con los posts de los usuarios que sigo.            |
| US4 | Como visitante de un perfil, quiero ver si sigo o no a ese usuario y cuántos seguidores/tiene.  |
| US5 | Como usuario, quiero ver en el feed del perfil de otros cuántos posts tienen (no el feed home). |

## 4. Requisitos funcionales (EARS)

- **RF-1** CUANDO un usuario autenticado envíe POST /users/:username/follow, EL SISTEMA creará la relación de follow y atomically incrementará `followersCount` en el target y `followingCount` en el source.
- **RF-2** CUANDO un usuario autenticado envíe DELETE /users/:username/follow, EL SISTEMA eliminará la relación y decrementará los contadores atómicamente.
- **RF-3** CUANDO se intente seguir a uno mismo, EL SISTEMA responderá 400.
- **RF-4** CUANDO se intente seguir a un usuario ya seguido, EL SISTEMA responderá 409.
- **RF-5** CUANDO se intente dejar de seguir a alguien no seguido, EL SISTEMA responderá 404.
- **RF-6** CUANDO un post sea creado, EL SISTEMA encolará un job `fan-out-post` que insertará el post en la lista Redis de cada follower (con cap de 10 000 followers; para cuentas mayores se usa pull on read).
- **RF-7** CUANDO se consulte GET /feed, EL SISTEMA devolverá posts de usuarios seguidos paginados con cursor (`createdBefore`) y límite configurable (default 20), leyendo primero de Redis list y fallback a query Postgres.
- **RF-8** CUANDO un post sea eliminado, EL SISTEMA removerá el post de todas las listas Redis de feed donde aparezca.
- **RF-9** CUANDO se consulte el perfil público de un usuario, EL SISTEMA incluirá `followersCount`, `followingCount`, `isFollowing` (si el consultante está autenticado).
- **RF-10** CUANDO un perfil sea privado y el consultante no lo siga, EL SISTEMA devolverá 404 al intentar ver sus posts (excepto el propio usuario).

## 5. Endpoints previstos (contrato v1)

| Método | Ruta                             | Auth   | Descripción                                   |
| ------ | -------------------------------- | ------ | --------------------------------------------- |
| POST   | `/api/v1/users/:username/follow` | access | Seguir a un usuario                           |
| DELETE | `/api/v1/users/:username/follow` | access | Dejar de seguir                               |
| GET    | `/api/v1/feed`                   | access | Feed cronológico de seguidos                  |
| GET    | `/api/v1/users/:username`        | —      | Perfil público (con contadores + isFollowing) |

## 6. Criterios de aceptación (Gherkin)

```gherkin
Escenario: Seguir a otro usuario
  Dado un usuario autenticado A
  Cuando A envía POST /users/b/follow
  Entonces recibe 200 con { "following": true }
  Y el perfil de B muestra followersCount incremented
  Y el perfil de A muestra followingCount incremented

Escenario: No seguir a uno mismo
  Dado un usuario autenticado A
  Cuando A envía POST /users/a/follow
  Entonces recibe 400 con "No puedes seguirte a ti mismo"

Escenario: Dejar de seguir
  Dado un usuario A que sigue a B
  Cuando A envía DELETE /users/b/follow
  Entonces recibe 200 con { "following": false }
  Y los contadores se decrementan

Escenario: Follow idempotente (ya sigue)
  Dado un usuario A que ya sigue a B
  Cuando A envía POST /users/b/follow
  Entonces recibe 409

Escenario: Feed cronológico
  Dado un usuario A que sigue a B y C
  Y B creó un post hace 1 hora
  Y C creó un post hace 2 horas
  Cuando A consulta GET /feed
  Entonces recibe los posts de B y C ordenados por created_at DESC

Escenario: Feed vacío
  Dado un usuario A que no sigue a nadie
  Cuando A consulta GET /feed
  Entonces recibe { "items": [], "nextCursor": null }

Escenario: Fan-out al crear post
  Dado un usuario B con 50 seguidores
  Cuando B crea un post
  Entonces el post aparece en el feed Redis de cada seguidor dentro de 5 segundos

Escenario: Post eliminado desaparece del feed
  Dado un post de B en el feed de A
  Cuando B elimina su post
  Entonces el post ya no aparece en GET /feed de A
```

## 7. No funcionales

- p95 de GET /feed < 100 ms con caché Redis caliente.
- Fan-out job completado en < 5 s para cuentas con ≤ 10 000 followers.
- Contadores followersCount/followingCount siempre consistentes (operaciones atómicas en DB).
- Cobertura ≥ 75% módulo follows + feed.
- Unfollow en < 200 ms (operación directa en DB + invalidación Redis).
