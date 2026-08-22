# ADR 0001 — Sistema de UI: Tailwind CSS v4 + shadcn/ui

- Estado: Aceptado
- Fecha: 2026-08-21
- Decisión relacionada con: `docs/TECH_STACK.md` §2

## Contexto

El stack original proponía MUI + Tailwind como capa UI del frontend (Next.js). Analizar ambas juntas mostró redundancia: dos sistemas que resuelven estilos/layout, riesgo de conflicto de resets, bundle mayor y ambigüedad para el equipo.

## Alternativas consideradas

1. **MUI solo** — componentes completos, velocidad máxima, identidad "Material".
2. **Tailwind + shadcn/ui** ⭐ — utilidades CSS v4 + componentes copy-paste sobre Radix UI (accesibilidad incluida), personalizables al 100%.
3. **Híbrido** — descartado por duplicar responsabilidades.

## Decisión

**Opción 2: Tailwind CSS v4 + shadcn/ui** (elección del propietario del proyecto, 2026-08-21).

## Consecuencias

- `apps/web` usa Tailwind v4 (CSS-first, sin `tailwind.config.js`) con tokens shadcn en `src/app/globals.css`.
- Componentes base vivos en `src/components/ui/*` (se copian, no se instalan): propiedad total del código.
- Accesibilidad delegada a primitivas Radix UI.
- Iconografía: `lucide-react`.
- Prohibido introducir una segunda librería de componentes sin nuevo ADR.
