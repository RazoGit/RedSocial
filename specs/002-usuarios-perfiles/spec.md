# Spec 002 — Usuarios y Perfiles

- Estado: ✅ Completa
- Fecha: 2026-08-22
- Cierre: 2026-08-24
- Prioridad: P0
- Implementación: Fase 3 del ROADMAP · Dependencias: spec 001

## 1. Objetivo

Cada cuenta tiene un perfil público con identidad mínima de red social: username único, nombre visible, avatar y bio — editable por su dueño.

## 2. Alcance

**Incluye:** creación automática de perfil al registrarse, elegir/editar username (con reglas y cooldown), subir/cambiar avatar vía URL pre-firmada (MinIO/R2), bio con límite, ver perfil público por username, privacidad básica (perfil privado: oculta seguidores y posts a no-seguidores).

**No incluye:** seguir/bloquear (specs 004/007), badges de verificación, campos personalizados extensos.

## 3. Historias de usuario

| ID  | Historia                                                                                |
| --- | --------------------------------------------------------------------------------------- |
| US1 | Como usuario nuevo, quiero elegir un username único para que otros me encuentren.       |
| US2 | Como usuario, quiero editar mi nombre visible, bio y avatar para expresar mi identidad. |
| US3 | Como visitante, quiero ver el perfil público de un username con su información básica.  |
| US4 | Como usuario, quiero hacer mi perfil privado para controlar quién ve mi actividad.      |

## 4. Requisitos funcionales (EARS)

- **RF-1** CUANDO se complete el registro, EL SISTEMA creará perfil con username provisional derivado del email (editable 1 vez gratis).
- **RF-2** CUANDO se proponga un username, EL SISTEMA validará: 3–20 chars, `[a-z0-9_]`, no reservado (`admin`, `api`, `support`… lista en config), único case-insensitive.
- **RF-3** CUANDO un username sea cambiado, EL SISTEMA liberará el anterior tras 30 días (tabla `username_history`) y limitará cambios a 1 cada 14 días.
- **RF-4** CUANDO se solicite subida de avatar, EL SISTEMA emitirá URL pre-firmada PUT (JPEG/PNG/WebP ≤ 2 MB) y encolará job `media` que genera thumbnail 256px + blurhash.
- **RF-5** CUANDO otro usuario consulte `/users/:username`, EL SISTEMA devolverá datos públicos; si el perfil es privado y quien consulta no lo sigue, solo datos mínimos.
- **RF-6** TODOS los cambios de perfil quedarán auditados con `updatedAt`.

## 5. Endpoints previstos (contrato v1)

| Método | Ruta                              | Auth     |
| ------ | --------------------------------- | -------- |
| GET    | `/api/v1/users/me`                | access   |
| PATCH  | `/api/v1/users/me`                | access   |
| POST   | `/api/v1/users/me/avatar/presign` | access   |
| GET    | `/api/v1/users/:username`         | opcional |
| GET    | `/api/v1/users/check-username?u=` | —        |

## 6. Criterios de aceptación (Gherkin)

```gherkin
Escenario: Username inválido rechazado
  Cuando intento cambiar mi username a "Admin"
  Entonces recibo 422 indicando la regla violada sin consumir mi cambio periódico

Escenario: Avatar demasiado pesado
  Cuando solicito presign para "foto.tiff" de 5 MB
  Entonces recibo 422 con tipos/tamaños permitidos

Escenario: Perfil privado ante extraño
  Dado perfil privado de "@ana" y yo no la sigo
  Cuando consulto /users/ana
  Entonces recibo solo username, avatar y nombre; sin bio ni contadores
```

## 7. No funcionales

- p95 de lectura de perfil < 100 ms con caché Redis 60 s (invalidación por escritura).
- Thumbnails listos < 5 s tras subida (worker BullMQ `media`).
- Cobertura ≥ 75%.
