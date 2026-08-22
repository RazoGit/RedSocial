# ADR 0002 — Identidad visual y sistema de diseño

- Estado: Aceptado
- Fecha: 2026-08-22
- Complementa: [`0001-ui-tailwind-shadcn.md`](./0001-ui-tailwind-shadcn.md)

## Contexto

La fundación técnica (Tailwind v4 + shadcn/ui) quedó lista con base neutral monocromática, pero sin identidad de marca: color primario genérico, tipografía del sistema y sin conmutador de tema. El producto requiere personalidad definida antes de construir las pantallas de la spec 001.

## Decisiones (elección del propietario, 2026-08-22)

| Aspecto        | Decisión                                                                           | Justificación                                                           |
| -------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Personalidad   | **Minimalista con acento único** (referencias: X, Linear, Vercel)                  | Contenido protagonista, cero decoración; escala bien a features futuras |
| Color de marca | **Esmeralda** (`oklch(0.596 0.145 163.225)` en claro)                              | Diferenciador frente al azul dominante de redes sociales                |
| Tema           | **Claro por defecto** + toggle manual; respeta `prefers-color-scheme` como inicial | `next-themes`, persistencia en localStorage, sin flash                  |
| Tipografía     | **Geist Sans** vía paquete `geist`                                                 | Estética Linear/Vercel, optimizada para UI, variable font               |

## Aplicación práctica

- Tokens en `globals.css`: solo cambian `primary`, `ring`; el resto permanece monocromo (superficies/bordes grises).
- Contraste AA garantizado: claro usa esmeralda-600 sobre texto casi-blanco; oscuro usa esmeralda-400 con texto esmeralda-950.
- `suppressHydrationWarning` en `<html>` ya presente (requerido por el script de tema).
- Iconografía lucide-react; favicon con fondo esmeralda.

## Reglas derivadas

1. Prohibido introducir segundas familias de color salvo semánticos ya definidos (destructive).
2. Nuevos componentes usan tokens (`bg-primary`, `text-muted-foreground`…), nunca colores hardcodeados.
