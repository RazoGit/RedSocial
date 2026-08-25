# Plan 004 — Posts y Contenido

## 1. Modelo de datos (Prisma)

```prisma
model Post {
  id          String    @id @default(uuid()) @db.Uuid
  authorId    String    @map("author_id") @db.Uuid
  text        String?   @db.VarChar(500)
  editedAt    DateTime? @map("edited_at") @db.Timestamptz(3)
  deletedAt   DateTime? @map("deleted_at") @db.Timestamptz(3)
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt   DateTime  @updatedAt @map("updated_at") @db.Timestamptz(3)

  author   User          @relation(fields: [authorId], references: [id], onDelete: Cascade)
  media    PostMedia[]

  @@index([authorId, createdAt(sort: Desc)])
  @@index([createdAt(sort: Desc)])
  @@map("posts")
}

model PostMedia {
  id           String  @id @default(uuid()) @db.Uuid
  postId       String  @map("post_id") @db.Uuid
  key          String  // S3 key original
  thumbKey     String? @map("thumb_key") // S3 key thumbnail
  blurhash     String?
  width        Int?
  height       Int?
  contentType  String  @map("content_type") // image/jpeg, image/png, image/webp
  sortOrder    Int     @default(0) @map("sort_order")

  post Post @relation(fields: [postId], references: [id], onDelete: Cascade)

  @@index([postId])
  @@map("post_media")
}
```

**Índices compuestos:**

- `posts(author_id, created_at DESC)` — feed propio del autor
- `posts(created_at DESC)` — feed global (futuro)

**Soft delete:** `deletedAt` permite borrado lógico. Queries de feed/explorar filtran `WHERE deletedAt IS NULL`.

## 2. Contratos Zod (packages/contracts)

```typescript
// Request/Response schemas
CreatePostRequestSchema = z
  .object({
    text: z.string().max(500).optional(),
    mediaKeys: z.array(z.string()).max(4).optional(),
  })
  .refine((data) => data.text || data.mediaKeys?.length, "Se requiere texto o imágenes");

PostResponseSchema = z.object({
  id: z.uuid(),
  author: z.object({
    username: z.string(),
    displayName: z.string().nullable(),
    avatarUrl: z.string().nullable(),
  }),
  text: z.string().nullable(),
  media: z.array(PostMediaSchema),
  createdAt: z.string(),
  editedAt: z.string().nullable(),
});

PostMediaSchema = z.object({
  key: z.string(),
  thumbKey: z.string().nullable(),
  blurhash: z.string().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  contentType: z.string(),
});

PresignPostMediaRequestSchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  sizeBytes: z
    .number()
    .min(1)
    .max(5 * 1024 * 1024),
});

CursorPaginationSchema = z.object({
  limit: z.number().min(1).max(50).default(20),
  createdBefore: z.string().datetime().optional(),
});

PaginatedPostsResponseSchema = z.object({
  items: z.array(PostResponseSchema),
  nextCursor: z.string().nullable(),
});
```

## 3. Endpoints — detalles

### POST /posts

- Auth: access token
- Valida texto y mediaKeys contra el esquema
- `mediaKeys` deben pertenecer al autor (verificadas contra `post_media` o S3)
- Responde 201 con `PostResponse`

### GET /posts/:id

- Sin auth requerida (público)
- Si el post es de usuario privado y el consultante no es el dueño → 404
- Incluye media con thumbKey/blurhash

### PATCH /posts/:id

- Auth: access token, solo el autor
- Actualiza texto, setea `editedAt`
- Responde 200 con post actualizado

### DELETE /posts/:id

- Auth: access token, solo el autor
- Setea `deletedAt` (borrado lógico)
- Responde 204

### POST /posts/media/presign

- Auth: access token
- Emite PUT firmado para imagen (≤5 MB, JPEG/PNG/WebP)
- Retorna `{ key, uploadUrl }`
- No encola job aún (el job se encola al crear el post)

### GET /users/:username/posts

- Cursor-based: `?limit=20&createdBefore=<ISO>`
- Responde con items + nextCursor
- Solo muestra posts no eliminados del autor

## 4. Worker BullMQ — post-media-process

- Cola: `post-media`
- Payload: `{ postId, mediaId, key }`
- Proceso: descarga original → redimensiona (max 1200px side, WebP) → genera blurhash → sube thumbnail → actualiza `thumbKey`, `blurhash`, `width`, `height` en `post_media`
- Reutiliza la lógica existente de `MediaWorker` (spec 002) con path diferente

## 5. Frontend

### Composer (`/create`)

- Textarea con contador de caracteres (500 max)
- Botón para adjuntar imágenes (máx 4, con preview)
- Upload: presign → PUT → espera confirmación → submit
- publica y redirige al detalle del post

### Detalle de post (`/post/[id]`)

- Muestra autor (avatar, username, displayName), texto, imágenes (con blurhash placeholder), fecha
- Si es el dueño: botones editar/eliminar

### Grid de perfil (`/u/[username]`)

- Grid de thumbnails de posts (3 columnas desktop, 2 mobile)
- Click → navega a detalle

### Infinite scroll

- Hook `useInfiniteScroll` con IntersectionObserver
- Fetch progresivo usando `createdBefore` cursor

## 6. Seguridad

- Validación estricta de `mediaKeys`: solo imagenes propias, máximo 4
- Borrado lógico: posts eliminados no aparecen en feeds ni perfil público
- Rate limit en creación de posts: 10/min por usuario (spec futura)
- Imágenes: validación MIME/tamaño en presign, worker verifica al procesar

## 7. Migración

```bash
pnpm --filter @redsocial/api prisma:migrate --name add_posts_and_media
```

Genera las tablas `posts` y `post_media` con índices.
