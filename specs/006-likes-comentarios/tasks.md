# Tasks 006 — Likes y Comentarios

> Regla: cada tarea es verificable de forma independiente y sigue test-first donde aplica.
> No se avanza a la siguiente si la anterior no compila, pasa sus tests y lint.

## Bloque A — Modelo de datos

- [x] **T1.** Prisma: modelo `Like` (plan S1) con unique compuesto `[userId, postId]` e indice en `postId`. _Verificar: `prisma migrate dev` sin error._
- [x] **T2.** Prisma: modelo `Comment` (plan S1) con `parentId` auto-referencial, indice en `[postId, createdAt]`. _Verificar: `prisma migrate dev` sin error._
- [x] **T3.** Prisma: anadir campos `likesCount` y `commentsCount` a `Post` (default 0). Migracion aplicada. _Verificar: `prisma db pull` muestra los campos._

## Bloque B — Contratos

- [x] **T4.** Contratos Zod en `@redsocial/contracts`: LikeResponseSchema, CreateCommentRequestSchema, CommentResponseSchema, CommentsQuerySchema, CommentsResponseSchema. Actualizar PostResponseSchema con `likesCount`, `commentsCount`, `isLiked`. _Verificar: `pnpm build` en packages/contracts sin errores._

## Bloque C — Like/Unlike API

- [x] **T5.** `POST /posts/:id/like`: inserta Like + incrementa `likesCount` atomicamente. Tests: like valido (200), like duplicado (409), post inexistente (404), sin token (401).
- [x] **T6.** `DELETE /posts/:id/like`: elimina Like + decrementa `likesCount`. Tests: unlike valido (200), unlike no liked (404), sin token (401).
- [x] **T7.** Servicio `LikesService`: logica de like/unlike con transacciones SQL para contadores atomicos. _Verificar: tests unitarios cubren happy path, duplicado, no existe._

## Bloque D — Comments API

- [x] **T8.** `POST /posts/:id/comments`: crea comentario + incrementa `commentsCount` atomicamente. Tests: comentario valido (201), respuesta a comentario (201), respuesta a respuesta (400), post inexistente (404), sin token (401), texto vacio (400).
- [x] **T9.** `GET /posts/:id/comments`: lista comentarios de nivel 0 paginados con replies (max 3). Tests: listar comentarios, paginacion, respuestas incluidas, total correcto.
- [x] **T10.** `DELETE /posts/:id/comments/:commentId`: elimina comentario + decrementa `commentsCount`. Tests: eliminar propio (200), eliminar ajeno (403), comentario inexistente (404), sin token (401).
- [x] **T11.** Servicio `CommentsService`: logica de crear/listar/eliminar con transacciones SQL. _Verificar: tests unitarios cubren happy path, validacion parentId, autorizacion._

## Bloque E — Integracion con Posts

- [x] **T12.** Actualizar `PostResponse` en backend para incluir `likesCount`, `commentsCount`. Si hay autenticacion, incluir `isLiked`. Tests: post con likes, post sin likes, isLiked true/false.
- [x] **T13.** Integracion: al eliminar un post, eliminar comments y likes en cascada (ya manejado por `onDelete: Cascade` en Prisma). Tests: post eliminado no tiene comments/likes.

## Bloque F — Frontend

- [x] **T14.** Regenerar OpenAPI + cliente Orval. _Verificar: `pnpm generate:api` exitoso._
- [x] **T15.** Boton like en `PostCard`: corazon con estado optimista (click -> actualiza UI -> envia request -> revierte si falla). Muestra `likesCount`. _Verificar: interaccion visual correcta._
- [x] **T16.** Seccion de comentarios en `PostCard`: boton "Ver comentarios" que expande la seccion, input para comentar, lista de comentarios con avatar/nombre/texto/fecha. _Verificar: comentarios se cargan y muestran._
- [x] **T17.** Pagina de detalle `/post/[id]`: post completo + seccion comentarios completa con input + boton like grande. _Verificar: todos los elementos visuales presentes._
- [x] **T18.** Respuestas a comentarios: boton "Responder" en cada comentario, input que aparece inline, envio con `parentId`. _Verificar: respuesta creada aparece en la lista._

## Bloque G — Cierre

- [x] **T19.** Smoke manual end-to-end en dev: likear post, ver contador, quitar like, comentar, responder, ver comentarios paginados. _Verificar: flujo completo sin errores. Nota: validado con tests de integracion HTTP (supertest) que levantan la app completa con FakePrisma; requiere Docker activo para validacion manual en vivo._
- [x] **T20.** README actualizado + cobertura modulo likes/comments >=75%. _Verificar: tests pasan, modulo con unit + integration tests._

## Definition of Done de la spec

- [x] Todas las tareas marcadas y sus criterios demostrados
- [x] Criterios Gherkin de spec.md automatizados (unit/integracion segun plan S6)
- [x] Cobertura >=75% (likes/comments 98.46%) · CI verde · contrato OpenAPI sin breaking changes vs v0
- [x] Likes y comments probados con Docker (Redis + PostgreSQL): smoke E2E en vivo `SMOKE-OK-006` (18 aserciones HTTP) el 2026-08-30. De paso se corrigio `GET /posts/:id` y `GET /posts/user/:username` para resolver el viewer con `OptionalJwtAuthGuard` y asi incluir `isLiked` cuando hay token (T12).
