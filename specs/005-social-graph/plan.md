# Plan 005 — Grafo Social y Feed Principal

## 1. Modelo de datos (Prisma)

### Nuevos modelos

```prisma
/// Relación de seguimiento entre usuarios (spec 005). Único compuesto.
model Follow {
  id          String   @id @default(uuid()) @db.Uuid
  followerId  String   @map("follower_id") @db.Uuid
  followingId String   @map("following_id") @db.Uuid
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(3)

  follower  User @relation("following", fields: [followerId], references: [id], onDelete: Cascade)
  following User @relation("followers", fields: [followingId], references: [id], onDelete: Cascade)

  @@unique([followerId, followingId])
  @@index([followingId])
  @@map("follows")
}
```

### Campos añadidos a User

```prisma
model User {
  // ...campos existentes...
  followersCount Int @default(0) @map("followers_count")
  followingCount Int @default(0) @map("following_count")

  following Follow[] @relation("following")
  followers Follow[] @relation("followers")
}
```

**Migración:** `pnpm --filter @redsocial/api prisma:migrate --name add_follows_and_counters`

## 2. Contratos Zod (packages/contracts)

```typescript
// --- Follow ---
export const FollowResponseSchema = z.object({
  following: z.boolean(),
  followersCount: z.number().int(),
  followingCount: z.number().int(),
});
export type FollowResponse = z.infer<typeof FollowResponseSchema>;

// --- Feed ---
export const FeedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  createdBefore: z.string().datetime().optional(),
});
export type FeedQuery = z.infer<typeof FeedQuerySchema>;

export const FeedItemSchema = PostResponseSchema; // reutiliza PostResponse
export type FeedItem = z.infer<typeof FeedItemSchema>;

export const FeedResponseSchema = z.object({
  items: z.array(PostResponseSchema),
  nextCursor: z.string().nullable(),
});
export type FeedResponse = z.infer<typeof FeedResponseSchema>;

// --- UserProfile extendido ---
export const UserProfileResponseSchema = z.object({
  // ...campos existentes...
  followersCount: z.number().int(),
  followingCount: z.number().int(),
  isFollowing: z.boolean().optional(), // solo cuando hay autenticación
});
```

## 3. Endpoints — detalles

### POST /users/:username/follow

- Auth: access token
- Valida que `:username` exista y no sea el propio usuario
- INSERT en `follows` (si ya existe → 409)
- Incrementa `followersCount` (target) y `followingCount` (source) con `UPDATE ... SET count = count + 1` (atómico)
- Responde 200 con `{ following: true, followersCount, followingCount }`

### DELETE /users/:username/follow

- Auth: access token
- DELETE de `follows` (si no existe → 404)
- Decrementa contadores atómicamente
- Responde 200 con `{ following: false, followersCount, followingCount }`
- Invalida la caché Redis del feed del usuario que dejó de seguir

### GET /feed

- Auth: access token (obligatorio)
- Cursor-based: `?limit=20&createdBefore=<ISO>`
- **Estrategia de lectura:**
  1. Intentar leer de Redis list `feed:{userId}` (LPUSH en fan-out)
  2. Si la lista tiene items → devolverlos con cursor basado en timestamp
  3. Si está vacía o stale → fallback a query Postgres: `SELECT p.* FROM posts p JOIN follows f ON f.following_id = p.author_id WHERE f.follower_id = $userId AND p.deleted_at IS NULL ORDER BY p.created_at DESC`
- Responde `{ items, nextCursor }`

### GET /users/:username (actualizado)

- Añade a la respuesta: `followersCount`, `followingCount`
- Si hay token de acceso: `isFollowing` (query a `follows` o cache)
- Si el perfil es privado y el consultante no lo sigue → devolver solo `MinimalProfileResponse`

## 4. Fan-out worker (BullMQ)

**Cola:** `fan-out-post`

**Payload:**

```typescript
{
  postId: string;
  authorId: string;
}
```

**Proceso:**

1. Buscar todos los `followerId` del author (query `follows` table)
2. Si `followersCount ≤ 10 000` (push mode):
   - Por cada follower: `LPUSH feed:{followerId} { postId, createdAt, authorId }`
   - `LTRIM feed:{followerId} 0 999` (mantener últimos 100 posts)
   - `EXPIRE feed:{followerId} 604800` (7 días TTL)
3. Si `followersCount > 10 000` (pull mode):
   - No hacer nada; el feed se construye por query en GET /feed

**Invalidación en DELETE /posts/:id:**

- Por cada feed Redis que contenga el postId → `LREM feed:{userId} 1 {postId}`
- Implementación: al momento de soft delete, iterar los feeds que podrían tenerlo (o usar un Set auxiliary por post con los feed IDs afectados)

## 5. Redis — estructura de caché

```
feed:{userId}     → LIST  (postId-based items, máx 1000)
TTL: 7 días
Escritura: fan-out LPUSH
Lectura: LRANGE con cursor
Invalidación: LREM en delete
```

**Formato del item en Redis:**

```json
{ "postId": "uuid", "createdAt": "ISO", "authorId": "uuid" }
```

## 6. Frontend

### Feed principal (`/feed`)

- Reemplazar mock data con fetch real a `GET /feed`
- Mantener tabs "Para ti" (mock) y "Siguiendo" (real, feed cronológico)
- Cada tab carga con infinite scroll (hook existente `useInfiniteScroll`)
- `PostCard` adaptado para recibir `PostResponse` del API en vez de `MockPost`

### Botón seguir en perfil público (`/u/[username]`)

- Botón "Seguir / Dej de seguir" con estado optimista
- Al hacer click: enviar follow/unfollow → actualizar contadores localmente → si falla, revertir
- Mostrar `followersCount` y `followingCount` en el perfil
- Si `isFollowing === true`: botón outline "Siguiendo" (hover: "Dejar de seguir")
- Si `isFollowing === false`: botón primario "Seguir"

## 7. Seguridad

- Un usuario no puede seguirse a sí mismo (validación server-side)
- Follow idempotente: POST duplicado → 409 (no error de DB)
- Unfollow de no seguido → 404
- Feed solo accesible con autenticación
- Contadores siempre se actualizan con operaciones atómicas SQL (no reads + writes)

## 8. Migración

```bash
pnpm --filter @redsocial/api prisma:migrate --name add_follows_and_counters
```

Añade tabla `follows` con índices y campos `followers_count`, `following_count` en `users`.
