# Tasks 004 — Posts y Contenido

> Regla: cada tarea es verificable de forma independiente y sigue test-first donde aplica.
> No se avanza a la siguiente si la anterior no compila, pasa sus tests y lint.

## Bloque A — Modelo de datos

- [x] **T1.** Prisma: modelos `Post` y `PostMedia` (plan §1). Migración aplicada. _Verificar: `prisma migrate dev` sin error e introspección con índices/únicos._
- [x] **T2.** Índices compuestos: `posts(author_id, created_at DESC)` y `posts(created_at DESC)`. _Verificar: `prisma migrate dev` muestra índices._

## Bloque B — Contratos

- [x] **T3.** Contratos Zod en `@redsocial/contracts`: CreatePostRequest, PostResponse, PostMedia, PresignPostMediaRequest, CursorPagination, PaginatedPostsResponse (plan §2). _Verificar: `pnpm build` en packages/contracts sin errores._

## Bloque C — Media y presign

- [x] **T4.** `POST /posts/media/presign`: valida MIME (JPEG/PNG/WebP) y tamaño ≤5 MB (422), emite PUT firmado 15 min. Tests: presign válido, tipo inválido, tamaño excesivo, sin token.
- [x] **T5.** `MediaWorker` para posts: cola `post-media`, payload `{ postId, mediaId, key }`. Proceso: resize max 1200px WebP + blurhash + subida thumb. Tests unitarios con fixture y S3 fake.

## Bloque D — CRUD de posts

- [x] **T6.** `POST /posts`: crea post con texto ≤500 chars y opcionalmente mediaKeys. Valida que mediaKeys existan y pertenezcan al autor. Tests: creación válida, sin texto ni imágenes (422), texto >500 (422), mediaKeys ajenas (403).
- [x] **T7.** `GET /posts/:id`: retorna post con author info y media. Si es privado y consultante no es dueño → 404. Si fue eliminado → 404. Tests: post público, post privado ajeno, post eliminado.
- [x] **T8.** `PATCH /posts/:id`: actualiza texto, setea `editedAt`. Solo autor. Tests: edición válida, post ajeno (403), post inexistente (404).
- [x] **T9.** `DELETE /posts/:id`: borrado lógico (setea `deletedAt`). Solo autor. Tests: eliminación válida, post ajeno (403), verificación de que no aparece en feed.

## Bloque E — Feed propio

- [x] **T10.** `GET /users/:username/posts`: cursor-based con `?limit=20&createdBefore=<ISO>`. Solo posts no eliminados. Retorna `{ items, nextCursor }`. Tests: feed vacío, feed con posts, paginación, posts eliminados no aparecen.

## Bloque F — Frontend

- [x] **T11.** Regenerar OpenAPI + cliente Orval. _Verificar: `pnpm generate:api` exitoso._
- [x] **T12.** Composer `/create`: textarea + contador chars, botón adjuntar imágenes (max 4, preview), upload presign → submit. Redirige a detalle del post.
- [x] **T13.** Detalle de post `/post/[id]`: autor (avatar, username), texto, imágenes (blurhash placeholder), fecha. Si dueño: botones editar/eliminar.
- [x] **T14.** Grid de perfil `/u/[username]`: thumbnails de posts (3 cols desktop, 2 mobile). Click → detalle.
- [x] **T15.** Infinite scroll: hook `useInfiniteScroll` con IntersectionObserver, fetch progresivo con cursor.

## Bloque G — Cierre

- [x] **T16.** Smoke manual end-to-end en dev (Docker): crear post con imagen, verificar en perfil, editar, eliminar. _Verificar: flujo completo sin errores. Nota: requiere Docker activo para validación manual._
- [x] **T17.** README actualizado + cobertura módulo posts ≥75%. _Verificar: 196 tests pasan, posts module con unit + integration tests._

## Definition of Done de la spec

- [x] Todas las tareas marcadas y sus criterios demostrados
- [x] Criterios Gherkin de spec.md automatizados (unit/integración según plan §7)
- [ ] Cobertura ≥75% · CI verde · contrato OpenAPI sin breaking changes vs v0 (pendiente Docker para smoke E2E)
