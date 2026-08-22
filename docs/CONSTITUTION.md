# Constitución del Proyecto — RedSocial

Reglas no negociables que gobiernan todo el desarrollo bajo SDD. Ninguna feature, PR o cambio de infraestructura puede violarlas. Enmiendas requieren ADR.

## Principios

1. **Spec antes de código** — ninguna funcionalidad entra a `main` sin carpeta `specs/NNN-funcionalidad/` con `spec.md`, `plan.md` y `tasks.md` completos y verificados.
2. **El contrato manda** — el esquema OpenAPI generado desde los DTOs de NestJS es la única fuente de verdad front/back; los cambios breaking se detectan en CI.
3. **Tipado estricto end-to-end** — TypeScript `strict`; esquemas Zod compartidos en `packages/contracts`; prohibido `any`.
4. **Seguridad por defecto** — cookies `httpOnly`/`Secure`/`SameSite`, validación de todo input, rate limiting en endpoints públicos, secretos solo vía variables de entorno, dependencias auditadas en CI.
5. **Calidad verificada automáticamente** — CI bloquea merge si falla lint, typecheck, tests o build. Cobertura mínima: 70% backend / 60% frontend. E2E obligatorio para: auth, publicación, follow.
6. **Commits convencionales** — Conventional Commits validados por commitlint; un commit = un cambio coherente.
7. **Entornos reproducibles** — cualquier persona clona, ejecuta `pnpm i && docker compose up -d` y tiene el sistema completo local sin pasos manuales.
8. **Observabilidad desde el día 1** — errores a Sentry, trazas/métricas OTel; toda petición fallida debe ser diagnosticable sin reproducirla.
9. **Costo cero hasta tracción** — arquitectura y proveedores elegidos para desplegarse 100% en free tiers (ver TECH_STACK §12); escalar nunca requiere reescritura.
10. **Anti scope-creep** — nueva idea ⇒ nueva spec; nada se "agrega de paso". El MVP termina cuando los criterios de salida del ROADMAP están verdes.

## Flujo SDD obligatorio

```
spec.md → plan.md → tasks.md → implementación → verificación → PR
```

Cada tarea de `tasks.md` es verificable e incluye su test. Una spec se considera cerrada cuando todas sus tareas están hechas y sus criterios de aceptación demostrados.

## Stack congelado (salvo ADR)

Frontend Next.js+React+TS · UI Tailwind v4+shadcn/ui · Backend NestJS+Fastify · REST v1 + Socket.IO · PostgreSQL+Prisma · Redis+BullMQ · R2/MinIO · OAuth/OIDC+JWT cookies · Docker · GitHub Actions · Sentry+OTel.
