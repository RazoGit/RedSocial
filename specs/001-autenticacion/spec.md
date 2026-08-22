# Spec 001 — Autenticación y Sesiones

- Estado: Aprobada para planificación
- Fecha: 2026-08-22
- Prioridad: P0 (bloquea todas las demás features)
- Implementación: Fase 2 del ROADMAP

## 1. Objetivo

Cualquier persona puede crear una cuenta, iniciar sesión con email+contraseña o con Google/GitHub, y mantener una sesión segura en la web mediante cookies httpOnly con rotación de refresh tokens.

## 2. Alcance

**Incluye:** registro local (email+password), login local, OAuth 2.0/OIDC (Google, GitHub), verificación de email, sesión con JWT de acceso corto + refresh rotado, logout (individual y global), recuperación de contraseña, rate limiting sobre endpoints públicos.

**No incluye (otros specs):** perfiles editables (spec 002), roles/admin, MFA/2FA, bloqueo de cuentas, SSO empresarial, apps móviles nativas.

## 3. Historias de usuario

| ID  | Historia                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------- |
| US1 | Como visitante, quiero registrarme con email y contraseña para tener una cuenta propia.                        |
| US2 | Como usuario registrado sin verificar, quiero confirmar mi email por enlace para activar mi cuenta.            |
| US3 | Como usuario, quiero iniciar sesión con email+contraseña para acceder a mi cuenta.                             |
| US4 | Como usuario, quiero iniciar sesión con Google o GitHub en un clic, sin otra contraseña.                       |
| US5 | Como usuario, quiero permanecer autenticado entre visitas sin reingresar datos, y que mi sesión sea revocable. |
| US6 | Como usuario, quiero cerrar sesión en este dispositivo o en todos, cuando quiera.                              |
| US7 | Como usuario que olvidó su contraseña, quiero recuperarla por email sin perder mi cuenta.                      |

## 4. Requisitos funcionales (formato EARS)

- **RF-1** CUANDO se registre un email ya existente, EL SISTEMA responderá `409` sin revelar si el email tiene cuenta activa (mensaje genérico).
- **RF-2** CUANDO el registro sea válido, EL SISTEMA creará la cuenta inactiva (`emailVerified=false`), enviará email de verificación vía cola BullMQ y responderá `201`.
- **RF-3** CUANDO se abra un enlace de verificación válido (token de un solo uso, expira en 24 h), EL SISTEMA marcará el email verificado e iniciará sesión.
- **RF-4** CUANDO las credenciales sean correctas pero el email no esté verificado, EL SISTEMA permitirá login y ofrecerá reenviar verificación (decisión: no bloquear el MVP).
- **RF-5** CUANDO fallen 5 intentos de login desde una IP en 15 minutos, EL SISTEMA responderá `429` durante 15 min (rate limit Redis).
- **RF-6** CUANDO el login sea exitoso (local u OAuth), EL SISTEMA emitirá access token JWT (15 min) en el cuerpo y refresh token rotado en cookie `httpOnly` `Secure` `SameSite=Lax` `Path=/api/v1/auth`, y registrará la sesión (hash del token, UA, IP, expiración 30 días).
- **RF-7** CUANDO se use un refresh token ya consumido (posible robo), EL SISTEMA revocará toda la familia de sesiones del usuario y responderá `401` (detección de reuse).
- **RF-8** CUANDO el refresh sea válido, EL SISTEMA rotará el token: nuevo refresh en cookie, el anterior queda inválido; sliding expiration hasta máximo 90 días.
- **RF-9** CUANDO llegue el callback de OAuth con `code` válido, EL SISTEMA validará el `id_token`/perfil contra JWKS del proveedor, vinculará por email verificado del proveedor a cuenta existente o creará una nueva, y ejecutará RF-6.
- **RF-10** CUANDO se solicite logout, EL SISTEMA revocará la sesión actual y limpiará la cookie; `logout-all` revoca todas las sesiones del usuario.
- **RF-11** CUANDO se solicite recuperación con cualquier email, EL SISTEMA responderá siempre `202` (no enumeración) y enviará enlace válido 1 h si existe cuenta.
- **RF-12** CUANDO se restablezca con token válido, EL SISTEMA re-hasheará la contraseña, revocará todas las sesiones y notificará por email.
- **RF-13** TODOS los endpoints listados en §6 expondrán DTOs validados (whitelist, forbidNonWhitelisted) y estarán documentados en OpenAPI.

## 5. Reglas de negocio

- Contraseña mínimo 10 caracteres; hasheada con **argon2id** (parámetros OWASP).
- Un email = una cuenta; proveedores OAuth se vinculan a esa cuenta (tabla `oauth_accounts` N:1).
- Máximo 10 sesiones activas por usuario; la más antigua se expulsa al exceder.
- Tokens de verificación/recuperación: aleatorios 32 bytes, guardados **hasheados**, un solo uso.

## 6. Endpoints (contrato v1)

| Método | Ruta                                    | Auth           | Descripción                         |
| ------ | --------------------------------------- | -------------- | ----------------------------------- |
| POST   | `/api/v1/auth/register`                 | —              | Registro email+password             |
| POST   | `/api/v1/auth/login`                    | —              | Login local → tokens                |
| GET    | `/api/v1/auth/oauth/:provider`          | —              | Redirección a Google/GitHub         |
| GET    | `/api/v1/auth/oauth/:provider/callback` | —              | Callback OAuth → tokens             |
| POST   | `/api/v1/auth/refresh`                  | cookie refresh | Rotación de refresh token           |
| POST   | `/api/v1/auth/logout`                   | access         | Revoca sesión actual                |
| POST   | `/api/v1/auth/logout-all`               | access         | Revoca todas las sesiones           |
| POST   | `/api/v1/auth/verify-email`             | —              | Consume token de verificación       |
| POST   | `/api/v1/auth/resend-verification`      | —              | Reenvía email (rate limited)        |
| POST   | `/api/v1/auth/forgot-password`          | —              | Solicita reset (`202` siempre)      |
| POST   | `/api/v1/auth/reset-password`           | —              | Consume token y cambia contraseña   |
| GET    | `/api/v1/auth/me`                       | access         | Usuario actual (usado por frontend) |

## 7. Criterios de aceptación (Gherkin)

```gherkin
Escenario: Registro exitoso
  Cuando registro "ana@example.com" con contraseña válida
  Entonces recibo 201 y existe usuario inactivo con email ana@example.com
  Y Mailpit muestra un email con enlace /verify-email?token=...

Escenario: Email duplicado no enumera
  Cuando registro "ana@example.com" nuevamente
  Entonces recibo 409 con mensaje genérico idéntico para emails existentes o no

Escenario: Refresh con token robado
  Dado sesión S con refresh R ya consumido
  Cuando envío R en la cookie
  Entonces recibo 401 y todas las sesiones del usuario están revocadas

Escenario: Rate limit de login
  Cuando fallo 6 logins seguidos desde la misma IP
  Entonces la sexta respuesta es 429 con header Retry-After

Escenario: OAuth primer ingreso con Google
  Dado no existe cuenta para el email verificado "b@x.com" en Google
  Cuando completo el flujo OAuth
  Entonces se crea usuario verificado con oauth_account provider="google"
  Y recibo access token + cookie refresh y estado 200 en el callback frontend
```

## 8. Requisitos no funcionales

- p95 de login/refresh < 150 ms (sin incluir latencia de proveedor externo).
- Emails salen vía cola `email` (BullMQ); la petición HTTP nunca espera al SMTP.
- Toda respuesta de error sigue `ApiErrorResponseSchema` de `@redsocial/contracts`.
- Cobertura tests ≥ 80% en módulo auth (crítico); e2e Playwright de los 3 flujos felices.
- Sentry captura fallos de OAuth/JWT con contexto de proveedor y `trace_id`.

## 9. Dependencias

- Docker dev: Postgres + Redis + Mailpit (Fase 0) ✓
- Credenciales OAuth de desarrollo (Google Cloud Console / GitHub Developer settings)
- Worker de emails: productor en esta spec; consumer en Fase 8 (dev usa cola real con worker inline temporal)
