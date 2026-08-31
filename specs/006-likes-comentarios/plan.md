# Plan 006 — Likes y Comentarios

## 1. Modelo de datos (Prisma)

### Nuevos modelos

```prisma
/// Like de un usuario a un post (spec 006). Unico compuesto.
model Like {
  id        String   @id @default(uuid()) @db.Uuid
  userId    String   @map("user_id") @db.Uuid
  postId    String   @map("post_id") @db.Uuid
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  post Post @relation(fields: [postId], references: [id], onDelete: Cascade)

  @@unique([userId, postId])
  @@index([postId])
  @@map("likes")
}

/// Comentario en un post (spec 006). Anidacion maximo 1 nivel.
model Comment {
  id        String    @id @default(uuid()) @db.Uuid
  postId    String    @map("post_id") @db.Uuid
  authorId  String    @map("author_id") @db.Uuid
  parentId  String?   @map("parent_id") @db.Uuid
  text      String    @db.VarChar(500)
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt DateTime  @updatedAt @map("updated_at") @db.Timestamptz(3)
  deletedAt DateTime? @map("deleted_at") @db.Timestamptz(3)

  post   Post      @relation(fields: [postId], references: [id], onDelete: Cascade)
  author User      @relation(fields: [authorId], references: [id], onDelete: Cascade)
  parent Comment?  @relation("CommentReplies", fields: [parentId], references: [id], onDelete: Cascade)
  replies Comment[] @relation("CommentReplies")

  @@index([postId, createdAt(sort: Asc)])
  @@index([parentId])
  @@map("comments")
}
```

### Campos anyadidos a Post

```prisma
model Post {
  // ...campos existentes...
  likesCount    Int       @default(0) @map("likes_count")
  commentsCount Int       @default(0) @map("comments_count")

  likes    Like[]
  comments Comment[]
}
```

**Migracion:** `pnpm --filter @redsocial/api prisma:migrate --name add_likes_and_comments`

## 2. Contratos Zod (packages/contracts)

```typescript
// --- Like ---
export const LikeResponseSchema = z.object({
  liked: z.boolean(),
  likesCount: z.number().int(),
});
export type LikeResponse = z.infer<typeof LikeResponseSchema>;

// --- Comment ---
export const CreateCommentRequestSchema = z
  .object({
    text: z.string().min(1, "El comentario no puede estar vacio").max(500),
    parentId: z.string().uuid().optional(),
  })
  .strict();
export type CreateCommentRequest = z.infer<typeof CreateCommentRequestSchema>;

export const CommentAuthorSchema = z.object({
  username: z.string(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
});

export const CommentResponseSchema = z.object({
  id: z.string().uuid(),
  postId: z.string().uuid(),
  author: CommentAuthorSchema,
  text: z.string(),
  parentId: z.string().uuid().nullable(),
  replies: z.array(z.lazy(() => CommentResponseSchema)),
  createdAt: z.string(),
});
export type CommentResponse = z.infer<typeof CommentResponseSchema>;

export const CommentsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  createdBefore: z.string().datetime().optional(),
});
export type CommentsQuery = z.infer<typeof CommentsQuerySchema>;

export const CommentsResponseSchema = z.object({
  items: z.array(CommentResponseSchema),
  nextCursor: z.string().nullable(),
  total: z.number().int(),
});
export type CommentsResponse = z.infer<typeof CommentsResponseSchema>;

// --- PostResponse actualizado ---
export const PostResponseSchema = z.object({
  // ...campos existentes...
  likesCount: z.number().int(),
  commentsCount: z.number().int(),
  isLiked: z.boolean().optional(), // solo cuando hay autenticacion
});
```

## 3. Endpoints — detalles

### POST /posts/:id/like

- Auth: access token
- Valida que `:id` exista y no este eliminado
- INSERT en `likes` (si ya existe -> 409)
- Incrementa `likesCount` en Post con `UPDATE posts SET likes_count = likes_count + 1 WHERE id = $postId` (atomico)
- Responde 200 con `{ liked: true, likesCount }`

### DELETE /posts/:id/like

- Auth: access token
- DELETE de `likes` (si no existe -> 404)
- Decrementa `likesCount` atomicamente
- Responde 200 con `{ liked: false, likesCount }`

### POST /posts/:id/comments

- Auth: access token
- Valida que `:id` exista y no este eliminado
- Si `parentId` esta presente:
  - Verificar que el comentario padre exista y pertenezca al mismo post
  - Verificar que el comentario padre sea de nivel 0 (parentId == null)
  - Si no se cumple -> 400
- INSERT en `comments`
- Incrementa `commentsCount` en Post atomicamente
- Responde 201 con el comentario creado

### GET /posts/:id/comments

- Auth: access token
- Cursor-based: `?limit=20&createdBefore=<ISO>`
- Solo comentarios de nivel 0 (parentId IS NULL)
- Para cada comentario, incluir un array `replies` con las respuestas directas (maximo 3, ordenadas ASC)
- Responde `{ items, nextCursor, total }` (total es el conteo de comentarios de nivel 0)

### DELETE /posts/:id/comments/:commentId

- Auth: access token
- Verificar que el usuario autenticado sea el autor del comentario
- Si no es autor -> 403
- DELETE logico (soft delete) o DELETE fisico del comentario
- Decrementa `commentsCount` en Post atomicamente
- Si el comentario tenia respuestas, estas se eliminan en cascada

## 4. Estructura de modulos (NestJS)

```
apps/api/src/modules/
  likes/
    likes.module.ts
    likes.controller.ts
    likes.service.ts
    dto/
      like-response.dto.ts
  comments/
    comments.module.ts
    comments.controller.ts
    comments.service.ts
    dto/
      create-comment.dto.ts
      comment-response.dto.ts
```

**LikesModule:**

- Imports: PrismaModule, PostsModule (forwardRef)
- Controllers: LikesController
- Services: LikesService
- Exports: LikesService

**CommentsModule:**

- Imports: PrismaModule, PostsModule (forwardRef)
- Controllers: CommentsController
- Services: CommentsService
- Exports: CommentsService

**PostsModule (modificado):**

- Se anaden campos `likesCount`, `commentsCount` al Post model
- Se actualiza PostResponse para incluir los nuevos campos

## 5. Frontend

### Boton like en PostCard

- Icono de corazon (Heart de lucide-react)
- Estado optimista: click -> actualiza UI -> envia request -> revierte si falla
- Si `isLiked === true`: corazon relleno (color primary)
- Si `isLiked === false`: corazon-outline (color muted)
- Hover: cambio de color suave
- Animacion sutil al hacer like (scale pulse)

### Seccion de comentarios

- Debajo del PostCard, boton "Ver comentarios" que expande la seccion
- Input para comentar (solo si esta autenticado)
- Lista de comentarios con avatar, nombre, texto, fecha
- Boton "Responder" en cada comentario (maximo 1 nivel)
- Paginacion "Ver mas comentarios" con cursor
- Contador de comentarios visible en el PostCard

### Pagina de detalle de post (/post/[id])

- Post completo con todas las imagenes
- Seccion de comentarios completa con input
- Boton like grande
- Todos los comentarios paginados

## 6. Seguridad

- Un usuario no puede likear su propio post (validacion server-side, opcional segun spec)
- Like idempotente: POST duplicado -> 409 (no error de DB)
- Unlike de no liked -> 404
- Comentarios solo con autenticacion
- Solo el autor puede eliminar su comentario (403 si otro intenta)
- Respuestas solo 1 nivel (validacion server-side)
- Texto del comentario: maximo 500 caracteres, sanitizacion basica
- Contadores siempre se actualizan con operaciones atomicas SQL

## 7. Migracion

```bash
pnpm --filter @redsocial/api prisma:migrate --name add_likes_and_comments
```

Anade tablas `likes` y `comments` con indices, y campos `likes_count`, `comments_count` en `posts`.
