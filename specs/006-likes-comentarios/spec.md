# Spec 006 — Likes y Comentarios

- Estado: Borrador para planificacion
- Fecha: 2026-08-25
- Prioridad: P0
- Implementacion: Fase 6 del ROADMAP · Dependencias: spec 001, spec 002, spec 004, spec 005

## 1. Objetivo

Permitir a los usuarios expresar interaccion con los posts mediante likes (like/unlike) y comentarios anidados de un solo nivel, completando el ciclo de interaccion social basica de la plataforma.

## 2. Alcance

**Incluye:** Like/unlike idempotente con contadores atomicos en Post, comentarios anidados 1 nivel con paginacion cursor-based, seccion de comentarios en el frontend, boton de like con interaccion optimista.

**No incluye:** Notificaciones en tiempo real (spec 007), likes en comentarios, comentarios anidados multiples niveles, edicion/eliminacion de comentarios por el autor, moderacion de comentarios.

## 3. Historias de usuario

| ID  | Historia                                                                              |
| --- | ------------------------------------------------------------------------------------- |
| US1 | Como usuario, quiero dar like a un post para expresar que me gusta.                   |
| US2 | Like usuario, quiero quitar mi like de un post si cambio de opinion.                  |
| US3 | Como usuario, quiero ver cuantos likes tiene un post y si ya le di like.              |
| US4 | Como usuario, quiero comentar en un post para expresar mi opinion.                    |
| US5 | Como usuario, quiero ver los comentarios de un post ordenados cronologicamente.       |
| US6 | Como usuario, quiero responder a un comentario (1 nivel) para crear una conversacion. |
| US7 | Como autor de un post, quiero ver cuantos comentarios tiene.                          |

## 4. Requisitos funcionales (EARS)

- **RF-1** CUANDO un usuario autenticado envie POST /posts/:id/like, EL SISTEMA creara el like y atomicamente incrementara `likesCount` en el Post.
- **RF-2** CUANDO un usuario autenticado envie DELETE /posts/:id/like, EL SISTEMA eliminara el like y atomicamente decrementara `likesCount` en el Post.
- **RF-3** CUANDO se intente dar like a un post ya liked por el mismo usuario, EL SISTEMA respondra 409.
- **RF-4** CUANDO se intente quitar un like que no existe, EL SISTEMA respondra 404.
- **RF-5** CUANDO un post sea consultado, EL SISTEMA incluira `likesCount` y si el usuario autenticado ya le dio like (`isLiked`).
- **RF-6** CUANDO un usuario autenticado envie POST /posts/:id/comments con `{ text }`, EL SISTEMA creara el comentario y atomicamente incrementara `commentsCount` en el Post.
- **RF-7** CUANDO un comentario tenga `parentId`, EL SISTEMA verificara que el comentario padre pertenezca al mismo post y este a nivel 0 (respuestas a respuestas no permitidas). Si no se cumple, respondra 400.
- **RF-8** CUANDO se consulte GET /posts/:id/comments, EL SISTEMA devolvera comentarios de nivel 0 paginados con cursor (`createdBefore`) y limite configurable (default 20). Cada comentario incluira un array `replies` con las respuestas directas (maximo 3, sin paginacion adicional).
- **RF-9** CUANDO se elimine un post, EL SISTEMA eliminara todos sus comentarios en cascada.
- **RF-10** CUANDO un usuario autenticado envie DELETE /posts/:id/comments/:commentId, EL SISTEMA verificara que sea el autor del comentario y lo eliminara, decrementando atomicamente `commentsCount`.
- **RF-11** CUANDO se consulte el feed o un post individual, EL SISTEMA incluira `commentsCount` en la respuesta del post.

## 5. Endpoints previstos (contrato v1)

| Metodo | Ruta                                    | Auth   | Descripcion                      |
| ------ | --------------------------------------- | ------ | -------------------------------- |
| POST   | `/api/v1/posts/:id/like`                | access | Dar like a un post               |
| DELETE | `/api/v1/posts/:id/like`                | access | Quitar like                      |
| POST   | `/api/v1/posts/:id/comments`            | access | Crear comentario                 |
| GET    | `/api/v1/posts/:id/comments`            | access | Listar comentarios paginados     |
| DELETE | `/api/v1/posts/:id/comments/:commentId` | access | Eliminar comentario (solo autor) |

## 6. Criterios de aceptacion (Gherkin)

```gherkin
Escenario: Dar like a un post
  Dado un usuario autenticado A y un post P
  Cuando A envia POST /posts/P/like
  Entonces recibe 200 con { "liked": true, "likesCount": N+1 }
  Y el post muestra likesCount incremented

Escenario: Like idempotente (ya liked)
  Dado un usuario A que ya le dio like al post P
  Cuando A envia POST /posts/P/like
  Entonces recibe 409

Escenario: Quitar like
  Dado un usuario A que le dio like al post P
  Cuando A envia DELETE /posts/P/like
  Entonces recibe 200 con { "liked": false, "likesCount": N-1 }

Escenario: Quitar like que no existe
  Dado un usuario A que no le dio like al post P
  Cuando A envia DELETE /posts/P/like
  Entonces recibe 404

Escenario: Crear comentario
  Dado un usuario autenticado A y un post P
  Cuando A envia POST /posts/P/comments con { "text": "Buen post" }
  Entonces recibe 201 con el comentario creado
  Y el post muestra commentsCount incremented

Escenario: Respuesta a comentario
  Dado un comentario C en el post P
  Cuando A envia POST /posts/P/comments con { "text": "Respuesta", "parentId": "C" }
  Entonces recibe 201 con el comentario creado
  Y el comentario padre aparece en la lista con replies conteniendo la respuesta

Escenario: Respuesta a respuesta no permitida
  Dado un comentario C que ya es respuesta (parentId no nulo)
  Cuando A envia POST /posts/P/comments con { "text": "No permitido", "parentId": "C" }
  Entonces recibe 400 con "Los comentarios solo pueden anidarse un nivel"

Escenario: Listar comentarios
  Dado un post P con 5 comentarios de nivel 0
  Cuando A envia GET /posts/P/comments
  Entonces recibe los 5 comentarios ordenados por created_at ASC
  Y cada comentario tiene un array replies

Escenario: Eliminar comentario propio
  Dado un usuario A que es autor del comentario C
  Cuando A envia DELETE /posts/P/comments/C
  Entonces recibe 200
  Y el commentsCount del post se decrementa

Escenario: Eliminar comentario ajeno
  Dado un usuario A que no es autor del comentario C
  Cuando A envia DELETE /posts/P/comments/C
  Entonces recibe 403
```

## 7. No funcionales

- P95 de POST /posts/:id/like < 100 ms (operacion atomica en DB).
- P95 de GET /posts/:id/comments < 150 ms con pagination.
- Contadores likesCount/commentsCount siempre consistentes (operaciones atomicas en DB).
- Cobertura >= 75% modulo likes + comments.
- Like/unlike en < 200 ms (operacion directa en DB).
