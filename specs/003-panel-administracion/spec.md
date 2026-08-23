# Spec 003 — Panel de Administración

- Estado: Borrador para planificación (se planifica tras completar la spec 001)
- Fecha: 2026-08-23
- Prioridad: P2
- Implementación: sin fase asignada · Dependencias: spec 001 completa; introduce roles de usuario

## 1. Objetivo

Dar al propietario del sitio un dashboard privado para monitorear la actividad general de la plataforma —usuarios, sesiones, correos y salud de servicios— sin acceder a herramientas de desarrollo.

## 2. Alcance

**Incluye:** rol `admin` en el modelo de datos + guard de autorización; primer admin designado vía variable de entorno (`ADMIN_EMAIL`) promovido al arrancar; páginas `/admin` en el frontend protegidas por rol; métricas de lectura: usuarios registrados/verificados por día, sesiones activas y revocadas, intentos de login fallidos por IP (rate limiting), estado de la cola de emails (pendientes/fallidos), salud de Postgres/Redis.

**Fase 2 opcional (moderación):** revocar sesiones de un usuario, desactivar cuentas, reintentar emails fallidos.

**No incluye:** métricas históricas de latencia (Prometheus/grafana), auditoría de eventos, gestión multi-admin con UI, analytics de posts (dependen de spec 004+).

## 3. Historias de usuario

| ID  | Historia                                                                                             |
| --- | ---------------------------------------------------------------------------------------------------- |
| US1 | Como administrador, quiero ver cuántos usuarios se registraron y verificaron para medir crecimiento. |
| US2 | Como administrador, quiero ver sesiones activas y detección de reuse para vigilar la seguridad.      |
| US3 | Como administrador, quiero ver la salud de los servicios para reaccionar ante caídas.                |
| US4 | Como usuario normal, NO debo poder acceder a ninguna ruta ni endpoint de administración.             |

## 4. Requisitos funcionales (EARS)

- **RF-1** CUANDO arranque la API con `ADMIN_EMAIL` definido, EL SISTEMA promoverá a ese usuario a rol `admin` si existe (idempotente).
- **RF-2** CUANDO un usuario sin rol `admin` acceda a `/api/v1/admin/*` o `/admin*`, EL SISTEMA responderá 403 y ocultará las rutas del frontend.
- **RF-3** CUANDO el admin abra el dashboard, EL SISTEMA mostrará métricas agregadas con datos de las últimas 24 h y totales acumulados.
- **RF-4** CUANDO un servicio esté caído, EL SISTEMA lo marcará en rojo usando los checks existentes de `/ready`.
- **RF-5** TODAS las métricas se calcularán con consultas agregadas (sin exponer PII como contraseñas o tokens).

## 5. Endpoints previstos (contrato v1)

| Método | Ruta                     | Auth         |
| ------ | ------------------------ | ------------ |
| GET    | `/api/v1/admin/overview` | access+admin |
| GET    | `/api/v1/admin/sessions` | access+admin |
| GET    | `/api/v1/admin/emails`   | access+admin |

## 6. Criterios de aceptación (Gherkin)

```gherkin
Escenario: Acceso denegado a no-admin
  Dado un usuario autenticado con rol "user"
  Cuando solicita GET /api/v1/admin/overview
  Entonces recibe 403 sin filtrar datos

Escenario: Dashboard visible solo para admin
  Dado un usuario con rol "admin"
  Cuando navega a /admin
  Entonces ve usuarios registrados, sesiones activas y salud de servicios
```

## 7. No funcionales

- El overview responde < 500 ms con ~10k usuarios (consultas indexadas).
- Las rutas admin nunca aparecen en la navegación pública ni en OpenAPI público.
