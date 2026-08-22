# ADR 0003 — Identidad visual "R": dark-first con verde neón

- Estado: Aceptado
- Fecha: 2026-08-22
- Sustituye: [`0002-identidad-visual.md`](./0002-identidad-visual.md)
- Origen: mockup aprobado por el propietario ([`diseno_mockup_R.md`](../../diseno_mockup_R.md))

## Contexto

El ADR 0002 definió una identidad mínima (tema claro por defecto, esmeralda como acento, superficies neutras). El propietario aprobó posteriormente el mockup "R" (`diseno_mockup_R.md`), una propuesta visual dark-first —negro dominante, verde neón como lenguaje de interacción, minimalismo tecnológico— pensada originalmente para móvil pero válida como sistema de diseño de producto en cualquier breakpoint.

## Decisiones

| Aspecto        | Decisión                                                                                       | Justificación                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Marca          | **"R"** — logotipo: R estilizada en verde neón sobre superficie negra                          | Nombre corto, geométrico, memorable; coherente con el tagline del mockup            |
| Tema           | **Oscuro por defecto**; toggle manual se conserva y el tema claro sigue soportado              | El negro es el fondo canónico del diseño; claro queda como alternativa accesible    |
| Color de marca | **Verde neón**: `oklch(0.792 0.209 151.711)` en oscuro / `oklch(0.627 0.194 149.214)` en claro | Verde = acción, selección, estado activo y confirmación (lenguaje de interacción)   |
| Superficies    | Negro casi puro (`background`) + gris muy elevado (`card`, `popover`); bordes tenues           | Alto contraste, contenido protagonista                                              |
| Tipografía     | **Geist Sans** (sin cambios)                                                                   | Sans-serif limpia y moderna, cumple la dirección del mockup                         |
| Cobertura      | Mobile-first que escala a desktop: composición centrada con márgenes amplios y contenedores    | El mockup define móvil, pero los patrones (feed, perfil, bienvenida) son responsive |

## Aplicación práctica

- `globals.css`: se redefinen solo tokens (`primary`, `ring`, superficies); estructura shadcn intacta. Sin segundas familias de color.
- `components/logo.tsx` e `icon.svg`: cuadrado negro redondeado con la R en verde neón.
- `app/page.tsx`: pantalla de bienvenida según mockup — logo protagonista con glow verde, tagline **Conecta. Comparte. Revoluciona.** (última palabra en verde), subtítulo "Una nueva forma de conectar está aquí.", CTA primario sólido ("Crear cuenta") y secundario con borde verde ("Iniciar sesión").
- Efectos tecnológicos exclusivamente con CSS (gradientes radiales/grid pattern verdes a baja opacidad): sin imágenes ni dependencias nuevas.
- Contraste AA: en oscuro el texto sobre verde neón es casi negro; en claro se usa green-600 con texto blanco.

## Reglas derivadas

1. El verde neón comunica interacción/estado; prohibido usarlo como decoración pasiva masiva.
2. Los componentes siguen consumiendo tokens (`bg-primary`, `text-muted-foreground`…); nada hardcodeado.
3. Toda pantalla nueva debe verse correcta primero en móvil y reutilizar los mismos patrones al escalar (bordes redondeados, líneas finas, márgenes amplios).
