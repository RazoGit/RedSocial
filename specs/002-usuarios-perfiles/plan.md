# Plan 002 — Usuarios y Perfiles

> Decisiones técnicas para implementar [`spec.md`](./spec.md). Mantiene los patrones
> de la spec 001: módulo NestJS por dominio, DTOs validados con Zod de
> `@redsocial/contracts`, `FakePrisma` en memoria para tests de integración
> (CI sin servicios reales) y workers BullMQ inline mientras `apps/workers` no existe.

## §1 Modelo de datos

Se extiende `User` (una fila por cuenta ya existe; el perfil es parte de ella) y se
agrega una tabla nueva:

| Campo (`User`)      | Tipo                         | Notas                                                                   |
| ------------------- | ---------------------------- | ----------------------------------------------------------------------- |
| `username`          | `String? @unique @db.Citext` | Único case-insensitive (RF-2). Nulo solo si OAuth sin perfil creado aún |
| `displayName`       | `String?`                    | Nombre visible, máx. 50 chars                                           |
| `bio`               | `String?`                    | Máx. 280 chars                                                          |
| `avatarKey`         | `String?`                    | Objeto original en S3 (`avatars/{userId}/{uuid}.{ext}`)                 |
| `avatarThumbKey`    | `String?`                    | Thumbnail WebP 256px generado por el worker                             |
| `avatarBlurhash`    | `String?`                    | Placeholder de baja resolución (RF-4)                                   |
| `isPrivate`         | `Boolean @default(false)`    | Perfil privado (RF-5)                                                   |
| `usernameChangedAt` | `DateTime?`                  | Null = aún tiene su cambio gratis; si no, cooldown 14 días (RF-3)       |

`UsernameHistory`: `{ id, userId, username(citext), releasedAt, createdAt }`.
Al cambiar username, el anterior se registra con `releasedAt = now + 30 días`;
queda reservado hasta esa fecha y después puede ser tomado por otro usuario.
Índice `(username, releasedAt)` para la consulta de disponibilidad.

Migración SQL única; `citext` ya está habilitado en el datasource.

## §2 Username

- **Provisional (RF-1)**: derivado del email al registrarse — local-part normalizado
  a `[a-z0-9_]` (caracteres inválidos → `_`, colapsados), truncado a 16 + sufijo
  `-xxxx` aleatorio si excede o colisiona; mínimo 3 chars rellenando con `_`.
  Colisión → reintento con sufijo nuevo (máx. 5, luego error).
- **Reglas (RF-2)**: regex `^[a-z0-9_]{3,20}$`, lista de reservados configurable vía
  `USERNAME_RESERVED` (default: admin, administrator, api, support, root, system,
  moderator, mod, security, help, noreply). Unicidad contra `User.username` (citext)
  **y** contra `UsernameHistory` con `releasedAt > now`.
- **Cambio (RF-3)**: si `usernameChangedAt` es null el cambio es gratis; después,
  máximo 1 cada 14 días (422 si no). Cada cambio registra el anterior en history.

## §3 Endpoints (módulo `UsersModule`, prefijo `users`)

| Método | Ruta                              | Auth                                | Notas                                          |
| ------ | --------------------------------- | ----------------------------------- | ---------------------------------------------- |
| GET    | `/api/v1/users/me`                | access                              | Perfil propio completo (+email, emailVerified) |
| PATCH  | `/api/v1/users/me`                | access + CSRF no requerido (Bearer) | Body strict; devuelve perfil actualizado       |
| POST   | `/api/v1/users/me/avatar/presign` | access                              | Emite PUT pre-firmado y encola procesamiento   |
| GET    | `/api/v1/users/check-username?u=` | público                             | `{ available, reason? }`                       |
| GET    | `/api/v1/users/:username`         | opcional (OptionalJwtAuthGuard)     | Público o vista mínima según privacidad        |

Errores: 401 sin token · 404 usuario inexistente/borrado · 409 username ocupado ·
422 reglas violadas (formato, reservado, cooldown) — todo por el filtro global con
forma `ApiErrorResponse`.

## §4 Avatar (S3 + worker)

- `StorageService` encapsula `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`
  (MinIO en dev, R2 en prod vía env `S3_*` ya presentes en `.env.example`).
- **Presign (RF-4)**: valida `contentType ∈ {image/jpeg,image/png,image/webp}` y
  `sizeBytes ≤ 2 MB` (422 si no); genera PUT firmado (TTL 15 min) hacia la key
  definitiva y encola job `avatar-process` en la cola `media` con delay 15 s
  (da tiempo a la subida del cliente; 3 intentos verificando existencia).
- **Worker inline** (`MediaWorker`, cola `media`): descarga el original, `sharp`
  redimensiona a 256px WebP, `blurhash` codifica el thumbnail, sube el thumb y
  persiste `avatarThumbKey` + `avatarBlurhash`; borra thumb anterior si existía.
  El original se conserva (fuente para futuros tamaños).
- **URLs públicas**: GET pre-firmado con TTL 1 h generado al leer el perfil; vive
  dentro de la caché de 60 s sin desincronizarse.

## §5 Perfil público y privacidad

- `GET /users/:username` usa `OptionalJwtAuthGuard` (existe en common/guards).
- Vista completa: `{ id, username, displayName, bio, avatarUrl, avatarBlurhash, isPrivate, emailVerified }`.
- Si `isPrivate` y el solicitante no es el dueño → mínima:
  `{ username, displayName, avatarUrl, avatarBlurhash }` (Gherkin spec §6).
  Nota: hasta tener seguidores (specs 004/007), "no seguidor" = cualquiera ≠ dueño.
- **Caché Redis 60 s** (`ProfileCacheService`, ioredis `REDIS_URL`): clave
  `profile:{username}` con el JSON calculado; invalidación explícita en PATCH y
  al procesar el avatar. NFR p95 <100 ms se apoya aquí.

## §6 Frontend

- Regenerar contrato (`openapi:export` + Orval) y consumir el cliente generado
  desde `@redsocial/contracts`… (el cliente vive en `apps/web/src/lib/generated`).
- `/profile` (ya existe como maqueta): formulario react-hook-form + Zod con
  displayName, bio, username (disponibilidad debounced contra `check-username`),
  toggle de privacidad y subida de avatar (PUT directo a la URL firmada).
- Nueva ruta pública `/u/[username]`: server component que lee el endpoint y
  muestra la vista mínima cuando corresponde.

## §7 Testing

- Unit: derivación/reglas de username, validaciones presign, pipeline sharp+blurhash
  con fixtures, mutator de caché.
- Integración (FakePrisma + fakes de Storage/Cache/Email, igual que spec 001):
  flujos completos me/PATCH/cambio username/check/perfil público/privacidad.
- Smoke manual en dev contra Docker (Postgres, MinIO, Mailpit) antes de cerrar.
