# Spec 004 — Posts y Contenido

- Estado: Borrador para planificación
- Fecha: 2026-08-24
- Prioridad: P0
- Implementación: Fase 4 del ROADMAP · Dependencias: spec 001, spec 002

## 1. Objetivo

Permitir a los usuarios crear, editar y eliminar publicaciones con texto e imágenes, y consumir un feed propio paginado.

## 2. Alcance

**Incluye:** CRUD de posts (texto ≤500 chars, hasta 4 imágenes), borrado lógico, subida de imágenes vía URL pre-firmada (MinIO/R2), worker de thumbnails, feed propio paginado cursor-based, frontend composer/detalle de post/grid de perfil/infinite scroll.

**No incluye:** feed de seguidos (spec 005), likes/comentarios (spec 006), notificaciones (spec 007), posts con video/audio.

## 3. Historias de usuario

| ID  | Historia                                                                                  |
| --- | ----------------------------------------------------------------------------------------- |
| US1 | Como usuario, quiero crear una publicación con texto e imágenes para compartir contenido. |
| US2 | Como usuario, quiero editar mi publicación si aún no tiene interacciones.                 |
| US3 | Como usuario, quiero eliminar mi publicación (borrado lógico) para ocultarla del feed.    |
| US4 | Como visitante, quiero ver el detalle de una publicación con autor, texto e imágenes.     |
| US5 | Como usuario, quiero ver mis publicaciones en mi perfil con infinite scroll.              |

## 3. Requisitos funcionales (EARS)

- **RF-1** CUANDO un usuario autenticado envíe un post, EL SISTEMA creará la publicación con texto ≤500 chars y opcionalmente hasta 4 imágenes (JPEG/PNG/WebP, cada una ≤5 MB).
- **RF-2** CUANDO se solicite subida de imagen para post, EL SISTEMA emitirá URL pre-firmada PUT y encolará job `post-media-process` para generar thumbnail (1200px max side) + blurhash.
- **RF-3** CUANDO el dueño edite el texto de su post, EL SISTEMA actualizará `updatedAt` y mantendrá `editedAt` con timestamp.
- **RF-4** CUANDO el dueño elimine su post, EL SISTEMA realizará borrado lógico (`deletedAt`) y removerá del feed.
- **RF-5** CUANDO se consulte el feed propio de un usuario, EL SISTEMA devolverá posts paginados con cursor (`createdBefore`) y límite configurable (default 20).
- **RF-6** CUANDO un post tenga imágenes, EL SISTEMA incluirá URLs de thumbnail y blurhash en la respuesta.
- **RF-7** CUANDO un post sea privado y el consultante no sea el dueño, EL SISTEMA responderá 404.
- **RF-8** SOLO el autor del post podrá editarlo o eliminarlo; otros usuarios recibirán 403.

## 4. Endpoints previstos (contrato v1)

| Método | Ruta                            | Auth   | Descripción                 |
| ------ | ------------------------------- | ------ | --------------------------- |
| POST   | `/api/v1/posts`                 | access | Crear publicación           |
| GET    | `/api/v1/posts/:id`             | —      | Detalle de publicación      |
| PATCH  | `/api/v1/posts/:id`             | access | Editar texto del post       |
| DELETE | `/api/v1/posts/:id`             | access | Borrado lógico              |
| POST   | `/api/v1/posts/media/presign`   | access | URL pre-firmada para imagen |
| GET    | `/api/v1/users/:username/posts` | —      | Feed propio paginado cursor |

## 5. Criterios de aceptación (Gherkin)

```gherkin
Escenario: Crear post con texto válido
  Dado un usuario autenticado
  Cuando envía POST /posts con { "text": "Hola mundo", "mediaKeys": [] }
  Entonces recibe 201 con el post creado y authoredAt

Escenario: Rechazar post sin texto ni imágenes
  Dado un usuario autenticado
  Cuando envía POST /posts con { "text": "", "mediaKeys": [] }
  Entonces recibo 422 indicando que se requiere texto o imágenes

Escenario: Rechazar imagen >5 MB o tipo no admitido
  Dado un usuario autenticado
  Cuando solicita presign para "photo.bmp" de 6 MB
  Entonces recibo 422 con tipos/tamaños permitidos

Escenario: Solo el autor puede editar
  Dado un post de usuario A
  Cuando usuario B intenta PATCH /posts/:id
  Entonces recibe 403 Forbidden

Escenario: Borrado lógico remueve del feed
  Dado un post visible en el feed del autor
  Cuando el autor elimina su post
  Entonces el post ya no aparece en GET /users/:username/posts

Escenario: Feed propio paginado
  Dado un usuario con 50 posts
  Cuando consulto GET /users/:username/posts?limit=20
  Entonces recibo 20 posts con nextCursor
  Y al usar nextCursor recibo los siguientes 20
```

## 6. No funcionales

- p95 de lectura de post < 50 ms con caché Redis 30 s.
- Thumbnails listos < 5 s tras subida (worker BullMQ `post-media`).
- Borrado lógico: posts eliminados no aparecen en feeds ni en perfil público.
- Cobertura ≥ 75% módulo posts.
